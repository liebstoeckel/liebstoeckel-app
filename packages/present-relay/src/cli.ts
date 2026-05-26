#!/usr/bin/env bun
import { createRelay } from "./relay-server";

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

  const relay = createRelay({ accountTokens: tokens, port, publicBaseUrl });
  const base = publicBaseUrl?.replace(/\/$/, "") ?? `http://localhost:${relay.port}`;

  console.log(`\n▶  present-relay listening on :${relay.port}`);
  console.log(`   base url          ${base}`);
  console.log(`   health            ${base}/healthz`);
  if (generated) {
    console.log(`\n   ⚠ no account tokens set — generated one for this run:`);
    console.log(`       ${tokens[0]}`);
    console.log(`   persist with PRESENT_RELAY_TOKENS=tok1,tok2 (or --tokens).`);
  }
  console.log(`\n   run a deck through it:`);
  console.log(`       bunx present-it live <deck> --relay ${base} --relay-token <token>\n`);
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
