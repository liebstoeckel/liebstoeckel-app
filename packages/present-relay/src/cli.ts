#!/usr/bin/env bun
import { defineCommand, runMain } from "citty";
import { S3Client } from "bun";
import { createRelay, type RelayStorage } from "./relay-server";
import { relayPublicBaseFromPod } from "./addressing";
import { initTracing } from "./tracing";

/** Object storage for session snapshots ((internal ADR)), wired from S3_* env when present.
 *  Absent → the relay runs without persistence (transient/CLI use). */
function s3Storage(): RelayStorage | undefined {
  const endpoint = process.env.S3_ENDPOINT;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  if (!endpoint || !accessKeyId || !secretAccessKey) return undefined;
  const client = new S3Client({
    endpoint,
    accessKeyId,
    secretAccessKey,
    bucket: process.env.S3_BUCKET ?? "decks",
    region: process.env.S3_REGION ?? "us-east-1",
  });
  return {
    async get(key) {
      const f = client.file(key);
      return (await f.exists()) ? new Uint8Array(await f.arrayBuffer()) : null;
    },
    async put(key, bytes) {
      await client.write(key, bytes);
    },
  };
}

const hex = (bytes = 24): string => {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
};

export const relayCommand = defineCommand({
  meta: {
    name: "relay",
    description: "run a public relay (host live sessions for remote audiences)",
  },
  args: {
    port: {
      type: "string",
      description: "listen port (or PORT env); auto if omitted",
      valueHint: "N",
    },
    tokens: {
      type: "string",
      description: "comma-separated account tokens (or PRESENT_RELAY_TOKENS); one is generated if omitted",
    },
    "public-url": {
      type: "string",
      description: "public https origin so links/WebSocket use wss:// (or PRESENT_RELAY_PUBLIC_URL)",
      valueHint: "https://…",
    },
  },
  run({ args }) {
    initTracing("present-relay"); // gated by OTEL_EXPORTER_OTLP_ENDPOINT ((internal ADR) step 3b)
    const port = Number(args.port ?? process.env.PORT ?? 0) || 0;
    // Public base: an explicit override wins (CLI / single-pod env); otherwise a
    // StatefulSet pod derives its OWN per-pod base from its ordinal + host template
    // ((internal ADR) §3 / (internal ticket), POD_NAME via the downward API).
    const publicBaseUrl =
      args["public-url"] ??
      process.env.PRESENT_RELAY_PUBLIC_URL ??
      relayPublicBaseFromPod(process.env.POD_NAME, process.env.PRESENT_RELAY_HOST_TEMPLATE);
    let tokens = (args.tokens ?? process.env.PRESENT_RELAY_TOKENS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    let generated = false;
    if (!tokens.length) {
      tokens = [hex()];
      generated = true;
    }

    const storage = s3Storage();
    const relay = createRelay({ accountTokens: tokens, port, publicBaseUrl, storage });
    const base = publicBaseUrl?.replace(/\/$/, "") ?? `http://localhost:${relay.port}`;

    console.log(`\n▶  liebstoeckel relay listening on :${relay.port}`);
    console.log(`   base url          ${base}`);
    console.log(`   health            ${base}/healthz`);
    if (generated) {
      console.log(`\n   ⚠ no account tokens set, generated one for this run:`);
      console.log(`       ${tokens[0]}`);
      console.log(`   persist with PRESENT_RELAY_TOKENS=tok1,tok2 (or --tokens).`);
    }
    console.log(`\n   run a deck through it:`);
    console.log(`       bunx liebstoeckel live <deck> --relay ${base} --relay-token <token>\n`);
    if (!publicBaseUrl) {
      console.log(`   note: serve behind TLS (wss://) for public use; set --public-url to the https origin.\n`);
    }

    // Await the snapshot flush before exiting so a rolling deploy / drain doesn't lose
    // the last interval's live state ((internal ADR) §5 / (internal ticket)). k8s gives us
    // terminationGracePeriodSeconds (set on the StatefulSet) to finish.
    const shutdown = async () => {
      await relay.stop();
      process.exit(0);
    };
    process.on("SIGINT", () => void shutdown());
    process.on("SIGTERM", () => void shutdown());
  },
});

if (import.meta.main) void runMain(relayCommand);
