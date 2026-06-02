#!/usr/bin/env bun
import { S3Client } from "bun";
import { createRelay, type RelayStorage } from "./relay-server";

/** Object storage for session snapshots (ADR 0061), wired from S3_* env when present.
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

function flag(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

export function runRelay(argv: string[]) {
  const port = Number(flag(argv, "--port") ?? process.env.PORT ?? 0) || 0;
  const publicBaseUrl = flag(argv, "--public-url") ?? process.env.PRESENT_RELAY_PUBLIC_URL;
  let tokens = (flag(argv, "--tokens") ?? process.env.PRESENT_RELAY_TOKENS ?? "")
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
    console.log(`\n   ⚠ no account tokens set — generated one for this run:`);
    console.log(`       ${tokens[0]}`);
    console.log(`   persist with PRESENT_RELAY_TOKENS=tok1,tok2 (or --tokens).`);
  }
  console.log(`\n   run a deck through it:`);
  console.log(`       bunx liebstoeckel live <deck> --relay ${base} --relay-token <token>\n`);
  if (!publicBaseUrl) {
    console.log(`   note: serve behind TLS (wss://) for public use; set --public-url to the https origin.\n`);
  }

  const shutdown = () => {
    relay.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

if (import.meta.main) runRelay(process.argv.slice(2));
