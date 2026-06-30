# Changelog

## [0.3.7](https://github.com/liebstoeckel/liebstoeckel-app/compare/present-relay-v0.3.6...present-relay-v0.3.7) (2026-06-30)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @liebstoeckel/live-server bumped to 0.3.7

## [0.3.6](https://github.com/liebstoeckel/liebstoeckel-app/compare/present-relay-v0.3.5...present-relay-v0.3.6) (2026-06-24)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @liebstoeckel/live-server bumped to 0.3.6

## [0.3.5](https://github.com/liebstoeckel/liebstoeckel-app/compare/present-relay-v0.3.4...present-relay-v0.3.5) (2026-06-22)


### Features

* **build:** caret cross-dep ranges + single-copy guard ((internal ADR)) ([d3a9e28](https://github.com/liebstoeckel/liebstoeckel-app/commit/d3a9e28049b79b7ffed66ecae2ba8fd7be2932ce))


### Bug Fixes

* **oss-release:** clear pre-release review blockers across OSS packages ([fd55fb0](https://github.com/liebstoeckel/liebstoeckel-app/commit/fd55fb00715fdb4a9aaf9fe49f75240932d1fc8f))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @liebstoeckel/live-server bumped to 0.3.5

## [0.3.4](https://github.com/liebstoeckel/liebstoeckel-app/compare/present-relay-v0.3.3...present-relay-v0.3.4) (2026-06-13)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @liebstoeckel/live-server bumped to 0.3.4

## [0.3.3](https://github.com/liebstoeckel/liebstoeckel-app/compare/present-relay-v0.3.2...present-relay-v0.3.3) (2026-06-09)


### Miscellaneous Chores

* **present-relay:** Synchronize liebstoeckel versions


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @liebstoeckel/live-server bumped to 0.3.3

## [0.3.2](https://github.com/liebstoeckel/liebstoeckel-app/compare/present-relay-v0.3.1...present-relay-v0.3.2) (2026-06-07)


### Miscellaneous Chores

* **present-relay:** Synchronize liebstoeckel versions


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @liebstoeckel/live-server bumped to 0.3.2

## [0.3.1](https://github.com/liebstoeckel/liebstoeckel-app/compare/present-relay-v0.3.0...present-relay-v0.3.1) (2026-06-07)


### ⚠ BREAKING CHANGES

* npm scope, CLI binary, env vars and runtime globals renamed.

### Features

* **cli:** scaffold real ^version deck deps; version framework 0.1.0 ((internal ADR)) ([ebf6b82](https://github.com/liebstoeckel/liebstoeckel-app/commit/ebf6b82acda1f8f274cd3dd42b822a1b88968e68))
* **cli:** umbrella present-it CLI with deck scaffolding ([92e03b0](https://github.com/liebstoeckel/liebstoeckel-app/commit/92e03b0b23f213bbf53261abb21fd74535a533d3))
* **control:** control-reconciler — relay fleet drain + crash recovery ((internal ticket)) ([dbe3e5c](https://github.com/liebstoeckel/liebstoeckel-app/commit/dbe3e5ca5aacde637cbb64a106ce2a29577ad453))
* **control:** sticky relay session placement ((internal ticket)) ([4f8159e](https://github.com/liebstoeckel/liebstoeckel-app/commit/4f8159e96fb4d16243cd33331269b4440328f463))
* **deploy:** wire hosted live presenting on int ((internal ADR), phase 9) ([a6b7005](https://github.com/liebstoeckel/liebstoeckel-app/commit/a6b700523e6e233c8d77e48d6c3a4a6e51ed8456))
* **featureset-3:** build-time thumbnails + secure public relay ([dd3feba](https://github.com/liebstoeckel/liebstoeckel-app/commit/dd3febadd8641f64657d5298b29ea5242f34bc64))
* **live:** enforce plan duration + audience cap at the relay ((internal ticket), phase A) ([d3f7d33](https://github.com/liebstoeckel/liebstoeckel-app/commit/d3f7d333d5bf8f9b466f0fc18714acf8f51d3015))
* **live:** white-label the live audience view ((internal ticket), phase B) ([eddac49](https://github.com/liebstoeckel/liebstoeckel-app/commit/eddac49cc0b4218ca142356058e36b25343eff53))
* **live:** wire signed grants into the relay connect path ((internal ticket), phase E) ([6b09664](https://github.com/liebstoeckel/liebstoeckel-app/commit/6b096649349d24f01abf2bbaa538023270b7867e))
* **observability:** step 2 — OpenMetrics /metrics on relay, control-api, reconciler ((internal ticket)) ([48a09e2](https://github.com/liebstoeckel/liebstoeckel-app/commit/48a09e2996197cc9a7d196fcc145b51a8d326741))
* **observability:** step 3b.ii — OTLP span instrumentation + W3C propagation ((internal ticket)) ([4e42044](https://github.com/liebstoeckel/liebstoeckel-app/commit/4e42044e812705449a1f2c36fdffc0da05761e7c))
* **relay:** containerize + deploy a permanent WAN relay on the int cluster ([def0825](https://github.com/liebstoeckel/liebstoeckel-app/commit/def0825dbf9f1e57409960c8420d4bb3136ca23f))
* **relay:** enable the presenter pop-out (P) — sandbox allow-popups ([d6f2c70](https://github.com/liebstoeckel/liebstoeckel-app/commit/d6f2c70e0192aa3fd5b93a5749ae6ba6f9a17fa5))
* **relay:** hosted audience enforcement + snapshot persistence ((internal ADR), phase 7) ([ab1a54f](https://github.com/liebstoeckel/liebstoeckel-app/commit/ab1a54f84184928935eef6c5823cb3a7e8907545))
* **relay:** SERVER span at HTTP/WS ingress so the relay joins traces ([863d656](https://github.com/liebstoeckel/liebstoeckel-app/commit/863d656d15f58f59950f1f48cdb7b664792ff06e))
* **relay:** signed control↔relay grants ((internal ADR), phase 2) ([29f57e8](https://github.com/liebstoeckel/liebstoeckel-app/commit/29f57e8b32f043f088cc0a78652668806995c49d))
* **relay:** StatefulSet + per-pod addressing ((internal ticket)) ([a5d1a89](https://github.com/liebstoeckel/liebstoeckel-app/commit/a5d1a892fc46aeb5f4bc4d3d11e452180338f5ef))
* **relay:** surface snapshot-write failures ((internal ticket), phase D) ([663bc21](https://github.com/liebstoeckel/liebstoeckel-app/commit/663bc217d3a159e4f6703e410e274354bf74d003))
* **relay:** tighten deck CSP with default-src 'none' ((internal ADR)) ([14434bb](https://github.com/liebstoeckel/liebstoeckel-app/commit/14434bb1cfe3ca4194504496ab46cbf382215d0e))
* **relay:** transparent session routing — stable host + multi-layer ForwardAuth ((internal ticket)) ([cc96ca9](https://github.com/liebstoeckel/liebstoeckel-app/commit/cc96ca9617f56865c4224623a139cab9b26536df))


### Bug Fixes

* **cli:** fix --help on subcommands + docs/usability papercuts (audit) ([b68882b](https://github.com/liebstoeckel/liebstoeckel-app/commit/b68882beaa60a714ac215e3124f13a7209a74b35))
* **deps:** keep exact workspace pins for cross-deps (revert caret) ([6526a68](https://github.com/liebstoeckel/liebstoeckel-app/commit/6526a68b799a724bfbe6e9467e79d531c9227cb5))
* **deps:** use caret ranges for workspace cross-deps ([3675d30](https://github.com/liebstoeckel/liebstoeckel-app/commit/3675d30829a97ffcf9a47c4e8d9f9f505d86b4a4))
* **live:** detect a restarted relay pod, not just a missing one ((internal ticket)/0019) ([79a079d](https://github.com/liebstoeckel/liebstoeckel-app/commit/79a079d48fa51e0c2fb25048e16739e5e16f6c36))
* **relay:** await final snapshot flush on graceful shutdown ((internal ticket)) ([cf12426](https://github.com/liebstoeckel/liebstoeckel-app/commit/cf12426fb437cdc00ca362f7a0b2b8b4905382fb))
* **relay:** drop invalid 'allow-fullscreen' CSP sandbox token ([7e93045](https://github.com/liebstoeckel/liebstoeckel-app/commit/7e9304516cca258b932e48b39e9286cc18216764))
* **tracing:** set SpanKind on ingress/egress spans so trace structure builds ([1f9730a](https://github.com/liebstoeckel/liebstoeckel-app/commit/1f9730ae8da6053c459593fa2161de7a55ae0509))


### Miscellaneous Chores

* force release 0.3.1 (supersede broken 0.3.0 closure) ([87f1142](https://github.com/liebstoeckel/liebstoeckel-app/commit/87f1142a44d814ab86f2112a2e9c8dcd705fb57c))


### Code Refactoring

* rename present-it → liebstoeckel ([1c1dba6](https://github.com/liebstoeckel/liebstoeckel-app/commit/1c1dba6e34502aff8df6bab2f1183ef40bc83a0b))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @liebstoeckel/live-server bumped to 0.3.1

## [0.3.0](https://github.com/liebstoeckel/liebstoeckel-app/compare/present-relay-v0.2.1...present-relay-v0.3.0) (2026-06-07)


### Bug Fixes

* **deps:** keep exact workspace pins for cross-deps (revert caret) ([6526a68](https://github.com/liebstoeckel/liebstoeckel-app/commit/6526a68b799a724bfbe6e9467e79d531c9227cb5))
* **deps:** use caret ranges for workspace cross-deps ([3675d30](https://github.com/liebstoeckel/liebstoeckel-app/commit/3675d30829a97ffcf9a47c4e8d9f9f505d86b4a4))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @liebstoeckel/live-server bumped to 0.3.0

## [0.2.1](https://github.com/liebstoeckel/liebstoeckel-app/compare/present-relay-v0.2.0...present-relay-v0.2.1) (2026-06-07)


### Features

* **control:** control-reconciler — relay fleet drain + crash recovery ((internal ticket)) ([dbe3e5c](https://github.com/liebstoeckel/liebstoeckel-app/commit/dbe3e5ca5aacde637cbb64a106ce2a29577ad453))
* **control:** sticky relay session placement ((internal ticket)) ([4f8159e](https://github.com/liebstoeckel/liebstoeckel-app/commit/4f8159e96fb4d16243cd33331269b4440328f463))
* **observability:** step 2 — OpenMetrics /metrics on relay, control-api, reconciler ((internal ticket)) ([48a09e2](https://github.com/liebstoeckel/liebstoeckel-app/commit/48a09e2996197cc9a7d196fcc145b51a8d326741))
* **observability:** step 3b.ii — OTLP span instrumentation + W3C propagation ((internal ticket)) ([4e42044](https://github.com/liebstoeckel/liebstoeckel-app/commit/4e42044e812705449a1f2c36fdffc0da05761e7c))
* **relay:** SERVER span at HTTP/WS ingress so the relay joins traces ([863d656](https://github.com/liebstoeckel/liebstoeckel-app/commit/863d656d15f58f59950f1f48cdb7b664792ff06e))
* **relay:** StatefulSet + per-pod addressing ((internal ticket)) ([a5d1a89](https://github.com/liebstoeckel/liebstoeckel-app/commit/a5d1a892fc46aeb5f4bc4d3d11e452180338f5ef))
* **relay:** tighten deck CSP with default-src 'none' ((internal ADR)) ([14434bb](https://github.com/liebstoeckel/liebstoeckel-app/commit/14434bb1cfe3ca4194504496ab46cbf382215d0e))
* **relay:** transparent session routing — stable host + multi-layer ForwardAuth ((internal ticket)) ([cc96ca9](https://github.com/liebstoeckel/liebstoeckel-app/commit/cc96ca9617f56865c4224623a139cab9b26536df))


### Bug Fixes

* **cli:** fix --help on subcommands + docs/usability papercuts (audit) ([b68882b](https://github.com/liebstoeckel/liebstoeckel-app/commit/b68882beaa60a714ac215e3124f13a7209a74b35))
* **live:** detect a restarted relay pod, not just a missing one ((internal ticket)/0019) ([79a079d](https://github.com/liebstoeckel/liebstoeckel-app/commit/79a079d48fa51e0c2fb25048e16739e5e16f6c36))
* **relay:** await final snapshot flush on graceful shutdown ((internal ticket)) ([cf12426](https://github.com/liebstoeckel/liebstoeckel-app/commit/cf12426fb437cdc00ca362f7a0b2b8b4905382fb))
* **tracing:** set SpanKind on ingress/egress spans so trace structure builds ([1f9730a](https://github.com/liebstoeckel/liebstoeckel-app/commit/1f9730ae8da6053c459593fa2161de7a55ae0509))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @liebstoeckel/live-server bumped to 0.2.1

## [0.2.0](https://github.com/liebstoeckel/liebstoeckel-app/compare/present-relay-v0.1.0...present-relay-v0.2.0) (2026-06-02)


### ⚠ BREAKING CHANGES

* npm scope, CLI binary, env vars and runtime globals renamed.

### Features

* **cli:** scaffold real ^version deck deps; version framework 0.1.0 ((internal ADR)) ([ebf6b82](https://github.com/liebstoeckel/liebstoeckel-app/commit/ebf6b82acda1f8f274cd3dd42b822a1b88968e68))
* **cli:** umbrella present-it CLI with deck scaffolding ([92e03b0](https://github.com/liebstoeckel/liebstoeckel-app/commit/92e03b0b23f213bbf53261abb21fd74535a533d3))
* **deploy:** wire hosted live presenting on int ((internal ADR), phase 9) ([a6b7005](https://github.com/liebstoeckel/liebstoeckel-app/commit/a6b700523e6e233c8d77e48d6c3a4a6e51ed8456))
* **featureset-3:** build-time thumbnails + secure public relay ([dd3feba](https://github.com/liebstoeckel/liebstoeckel-app/commit/dd3febadd8641f64657d5298b29ea5242f34bc64))
* **live:** enforce plan duration + audience cap at the relay ((internal ticket), phase A) ([d3f7d33](https://github.com/liebstoeckel/liebstoeckel-app/commit/d3f7d333d5bf8f9b466f0fc18714acf8f51d3015))
* **live:** white-label the live audience view ((internal ticket), phase B) ([eddac49](https://github.com/liebstoeckel/liebstoeckel-app/commit/eddac49cc0b4218ca142356058e36b25343eff53))
* **live:** wire signed grants into the relay connect path ((internal ticket), phase E) ([6b09664](https://github.com/liebstoeckel/liebstoeckel-app/commit/6b096649349d24f01abf2bbaa538023270b7867e))
* **relay:** containerize + deploy a permanent WAN relay on the int cluster ([def0825](https://github.com/liebstoeckel/liebstoeckel-app/commit/def0825dbf9f1e57409960c8420d4bb3136ca23f))
* **relay:** enable the presenter pop-out (P) — sandbox allow-popups ([d6f2c70](https://github.com/liebstoeckel/liebstoeckel-app/commit/d6f2c70e0192aa3fd5b93a5749ae6ba6f9a17fa5))
* **relay:** hosted audience enforcement + snapshot persistence ((internal ADR), phase 7) ([ab1a54f](https://github.com/liebstoeckel/liebstoeckel-app/commit/ab1a54f84184928935eef6c5823cb3a7e8907545))
* **relay:** signed control↔relay grants ((internal ADR), phase 2) ([29f57e8](https://github.com/liebstoeckel/liebstoeckel-app/commit/29f57e8b32f043f088cc0a78652668806995c49d))
* **relay:** surface snapshot-write failures ((internal ticket), phase D) ([663bc21](https://github.com/liebstoeckel/liebstoeckel-app/commit/663bc217d3a159e4f6703e410e274354bf74d003))


### Bug Fixes

* **relay:** drop invalid 'allow-fullscreen' CSP sandbox token ([7e93045](https://github.com/liebstoeckel/liebstoeckel-app/commit/7e9304516cca258b932e48b39e9286cc18216764))


### Code Refactoring

* rename present-it → liebstoeckel ([1c1dba6](https://github.com/liebstoeckel/liebstoeckel-app/commit/1c1dba6e34502aff8df6bab2f1183ef40bc83a0b))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @liebstoeckel/live-server bumped to 0.2.0
