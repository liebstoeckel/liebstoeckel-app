// Kubernetes `coordination.k8s.io/v1` Lease objects over the REST API. Every
// write is conditioned on `resourceVersion`, so of two concurrent writers
// exactly one wins and the other gets "conflict".
//
// Bun's fetch has stalled against the Kubernetes API before (idle pooled
// connections dropped, long requests cut), so: no watch streams, a timeout on
// every request, no connection reuse, and a few retries on network errors and
// 5xx. A request that still fails throws; the holder loop treats that like a
// missed renewal and relies on its own clock.

import { existsSync, readFileSync } from "node:fs";
import type { LeaseRecord } from "./decide.ts";

export interface LeaseApi {
  get(name: string): Promise<LeaseRecord | null>;
  /** Every lease in the namespace (readers: which pods are alive). */
  list?(): Promise<LeaseRecord[]>;
  create(record: LeaseRecord): Promise<LeaseRecord | "conflict">;
  update(record: LeaseRecord): Promise<LeaseRecord | "conflict">;
}

export interface KubeLeaseApiOptions {
  /** The API server, e.g. https://kubernetes.default.svc:443 */
  baseUrl: string;
  namespace: string;
  /** Read per request: projected service-account tokens rotate. */
  token: () => string;
  /** PEM of the API server's CA. */
  ca?: string;
  timeoutMs?: number;
  attempts?: number;
  fetch?: typeof fetch;
}

interface KubeLease {
  apiVersion?: string;
  kind?: string;
  metadata: { name: string; namespace?: string; resourceVersion?: string };
  spec?: {
    holderIdentity?: string | null;
    leaseDurationSeconds?: number;
    acquireTime?: string | null;
    renewTime?: string | null;
    leaseTransitions?: number;
  };
}

function fromKube(l: KubeLease): LeaseRecord {
  return {
    name: l.metadata.name,
    holder: l.spec?.holderIdentity || null,
    durationSeconds: l.spec?.leaseDurationSeconds ?? 15,
    transitions: l.spec?.leaseTransitions ?? 0,
    acquireTime: l.spec?.acquireTime ?? null,
    renewTime: l.spec?.renewTime ?? null,
    resourceVersion: l.metadata.resourceVersion ?? "",
  };
}

function toKube(r: LeaseRecord, namespace: string): KubeLease {
  return {
    apiVersion: "coordination.k8s.io/v1",
    kind: "Lease",
    metadata: { name: r.name, namespace, ...(r.resourceVersion ? { resourceVersion: r.resourceVersion } : {}) },
    spec: {
      holderIdentity: r.holder ?? "",
      leaseDurationSeconds: r.durationSeconds,
      acquireTime: r.acquireTime,
      renewTime: r.renewTime,
      leaseTransitions: r.transitions,
    },
  };
}

export function kubeLeaseApi(opts: KubeLeaseApiOptions): LeaseApi {
  const base = `${opts.baseUrl.replace(/\/+$/, "")}/apis/coordination.k8s.io/v1/namespaces/${opts.namespace}/leases`;
  const doFetch = opts.fetch ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 4000;
  const attempts = opts.attempts ?? 3;

  const call = async (method: string, url: string, body?: unknown): Promise<Response> => {
    let lastErr: unknown;
    for (let i = 0; i < attempts; i++) {
      try {
        const res = await doFetch(url, {
          method,
          headers: {
            authorization: `Bearer ${opts.token()}`,
            accept: "application/json",
            ...(body ? { "content-type": "application/json" } : {}),
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(timeoutMs),
          keepalive: false,
          ...(opts.ca ? { tls: { ca: opts.ca } } : {}),
        } as RequestInit);
        if (res.status >= 500) {
          lastErr = new Error(`lease API ${method} ${res.status}`);
        } else {
          return res;
        }
      } catch (err) {
        lastErr = err;
      }
      if (i < attempts - 1) await Bun.sleep(200 * (i + 1));
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  };

  const fail = async (what: string, res: Response): Promise<never> => {
    throw new Error(`lease API ${what}: ${res.status} ${(await res.text()).slice(0, 200)}`);
  };

  return {
    async get(name) {
      const res = await call("GET", `${base}/${encodeURIComponent(name)}`);
      if (res.status === 404) return null;
      if (!res.ok) return fail(`get ${name}`, res);
      return fromKube((await res.json()) as KubeLease);
    },
    async list() {
      const res = await call("GET", base);
      if (!res.ok) return fail("list", res);
      return ((await res.json()) as { items?: KubeLease[] }).items?.map(fromKube) ?? [];
    },
    async create(record) {
      const res = await call("POST", base, toKube(record, opts.namespace));
      if (res.status === 409) return "conflict";
      if (!res.ok) return fail(`create ${record.name}`, res);
      return fromKube((await res.json()) as KubeLease);
    },
    async update(record) {
      const res = await call("PUT", `${base}/${encodeURIComponent(record.name)}`, toKube(record, opts.namespace));
      if (res.status === 409) return "conflict";
      if (!res.ok) return fail(`update ${record.name}`, res);
      return fromKube((await res.json()) as KubeLease);
    },
  };
}

const SA = "/var/run/secrets/kubernetes.io/serviceaccount";

/** The lease API of the cluster this pod runs in, or null outside Kubernetes
 *  (a self-hosted relay): then placement is off and one process owns all. */
export function inClusterLeaseApi(opts: { namespace?: string; timeoutMs?: number } = {}): LeaseApi | null {
  const host = process.env.KUBERNETES_SERVICE_HOST;
  if (!host || !existsSync(`${SA}/token`)) return null;
  const port = process.env.KUBERNETES_SERVICE_PORT_HTTPS ?? process.env.KUBERNETES_SERVICE_PORT ?? "443";
  const namespace = opts.namespace ?? readFileSync(`${SA}/namespace`, "utf8").trim();
  return kubeLeaseApi({
    baseUrl: `https://${host.includes(":") ? `[${host}]` : host}:${port}`,
    namespace,
    token: () => readFileSync(`${SA}/token`, "utf8").trim(),
    ca: existsSync(`${SA}/ca.crt`) ? readFileSync(`${SA}/ca.crt`, "utf8") : undefined,
    timeoutMs: opts.timeoutMs,
  });
}
