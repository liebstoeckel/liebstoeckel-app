// A live session on this machine: `liebstoeckel relay` (the installed CLI, on its
// pinned Bun) and the live driver with a presenter and phones against it: join and
// count, vote, a question, a reaction, an offline vote, the full card, the deck's own
// plugin and the ended card. Report, relay log and screenshots go to $RELEASE_OUT.
//   node live.mjs <deck.html> <port>
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { run, start, stop, waitHttp } from "./lib.mjs";

const [html, port] = process.argv.slice(2);
const out = process.env.RELEASE_OUT;
const drivers = join(process.env.RUNNER_TEMP ?? "", "drivers");
if (!html || !port || !out) {
  console.error("usage: live.mjs <deck.html> <port> (with RELEASE_OUT and RUNNER_TEMP set)");
  process.exit(2);
}
// The driver puts its screenshots next to the deck it uploads.
mkdirSync(join(out, "live"), { recursive: true });
const deck = join(out, "live", basename(html));
copyFileSync(html, deck);
const token = `release-${process.pid}-${Date.now()}`;
const base = `http://127.0.0.1:${port}`;
const relay = start("liebstoeckel", ["relay", "--port", port, "--tokens", token], join(out, "relay.log"));
let status = 1;
try {
  await waitHttp(`${base}/`, 120_000);
  const r = run("node", [join(drivers, "release-live.ts"), base, token, deck, "--live-slide", "8", "--join-slide", "10", "--applause"], {
    stdio: ["ignore", "pipe", "inherit"],
  });
  writeFileSync(join(out, "report-live.json"), r.stdout || "{}");
  console.log(r.stdout);
  status = r.status ?? 1;
} finally {
  stop(relay);
}
process.exit(status);
