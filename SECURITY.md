# Security policy

## Reporting a vulnerability

Please report security issues **privately** to **security@liebstoeckel.app**.
Do not open a public issue for anything you believe is a vulnerability.

Include what you can: the affected package and version, a reproduction or
proof of concept, and the impact as you understand it. You will get an
acknowledgement within **3 business days**. We will work with you on a fix and
coordinate disclosure; you will be credited in the release notes unless you
prefer otherwise.

This address also covers the hosted service (liebstoeckel.app), once it is
generally available.

## Supported versions

The project is experimental and pre-1.0: only the **latest published release** of
the `@liebstoeckel/*` packages receives security fixes, on a best-effort basis.

## Scope and the trust model

Knowing the intended trust model helps with triage:

- **Building or presenting a deck executes its code on your machine.** A deck is
  a program; `liebstoeckel build` and `liebstoeckel live` run it, including any
  server-side plugin code it bundles, with your privileges. This is by design
  and documented; "a malicious deck can run code on the host that builds it" is
  expected behavior, not a vulnerability. (`eject` documents rebuilding
  untrusted decks with `--ignore-scripts`.)
- **Relays never execute deck code.** A relay (and the hosted live session)
  carries the synced state of a session but must not run the deck itself, and
  audience members must only be able to interact through plugins.

In scope, for example: an escape of that model (a relay or an audience browser
executing deck-controlled code outside its sandbox, an audience member driving
navigation or tampering with another participant's state), credential handling
in the CLI (`~/.config/liebstoeckel/`), the build embedding files that the
deck's `files` allowlist and secret gate should have excluded, or dependency
confusion in the published packages.

## Coordinated disclosure

We follow a coordinated vulnerability disclosure (CVD) process with a
**90-day** default window: we ask you to hold public disclosure until a fix is
released or 90 days have passed since your report, whichever comes first; we
will agree on earlier or later dates with you where a fix realistically needs
it. Machine-readable contact details are published at
`https://liebstoeckel.app/.well-known/security.txt` (RFC 9116).

**Safe harbor:** we will not pursue legal action for good-faith security
research that stays within this policy — test only against your own
deployments or accounts, do not access or modify other people's data, and give
us reasonable time to fix before disclosure.

## Support period

Security-relevant records for the published packages (SBOMs, scan results,
declared support periods) are tracked in-repo under `.cra/`. The currently
declared support period for the 0.x line runs **through 2028-12-31** on the
pre-1.0 terms above (latest published release receives fixes); we intend to
re-declare a longer period with the 1.0 release.
