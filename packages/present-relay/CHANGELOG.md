# Changelog

## [0.2.0](https://github.com/limond/liebstoeckel-app/compare/present-relay-v0.1.0...present-relay-v0.2.0) (2026-06-02)


### ⚠ BREAKING CHANGES

* npm scope, CLI binary, env vars and runtime globals renamed.

### Features

* **cli:** scaffold real ^version deck deps; version framework 0.1.0 (ADR 0051) ([ebf6b82](https://github.com/limond/liebstoeckel-app/commit/ebf6b82acda1f8f274cd3dd42b822a1b88968e68))
* **cli:** umbrella present-it CLI with deck scaffolding ([92e03b0](https://github.com/limond/liebstoeckel-app/commit/92e03b0b23f213bbf53261abb21fd74535a533d3))
* **deploy:** wire hosted live presenting on int (ADR 0061, phase 9) ([a6b7005](https://github.com/limond/liebstoeckel-app/commit/a6b700523e6e233c8d77e48d6c3a4a6e51ed8456))
* **featureset-3:** build-time thumbnails + secure public relay ([dd3feba](https://github.com/limond/liebstoeckel-app/commit/dd3febadd8641f64657d5298b29ea5242f34bc64))
* **live:** enforce plan duration + audience cap at the relay (ticket 0015, phase A) ([d3f7d33](https://github.com/limond/liebstoeckel-app/commit/d3f7d333d5bf8f9b466f0fc18714acf8f51d3015))
* **live:** white-label the live audience view (ticket 0015, phase B) ([eddac49](https://github.com/limond/liebstoeckel-app/commit/eddac49cc0b4218ca142356058e36b25343eff53))
* **live:** wire signed grants into the relay connect path (ticket 0015, phase E) ([6b09664](https://github.com/limond/liebstoeckel-app/commit/6b096649349d24f01abf2bbaa538023270b7867e))
* **relay:** containerize + deploy a permanent WAN relay on the int cluster ([def0825](https://github.com/limond/liebstoeckel-app/commit/def0825dbf9f1e57409960c8420d4bb3136ca23f))
* **relay:** enable the presenter pop-out (P) — sandbox allow-popups ([d6f2c70](https://github.com/limond/liebstoeckel-app/commit/d6f2c70e0192aa3fd5b93a5749ae6ba6f9a17fa5))
* **relay:** hosted audience enforcement + snapshot persistence (ADR 0061, phase 7) ([ab1a54f](https://github.com/limond/liebstoeckel-app/commit/ab1a54f84184928935eef6c5823cb3a7e8907545))
* **relay:** signed control↔relay grants (ADR 0061, phase 2) ([29f57e8](https://github.com/limond/liebstoeckel-app/commit/29f57e8b32f043f088cc0a78652668806995c49d))
* **relay:** surface snapshot-write failures (ticket 0015, phase D) ([663bc21](https://github.com/limond/liebstoeckel-app/commit/663bc217d3a159e4f6703e410e274354bf74d003))


### Bug Fixes

* **relay:** drop invalid 'allow-fullscreen' CSP sandbox token ([7e93045](https://github.com/limond/liebstoeckel-app/commit/7e9304516cca258b932e48b39e9286cc18216764))


### Code Refactoring

* rename present-it → liebstoeckel ([1c1dba6](https://github.com/limond/liebstoeckel-app/commit/1c1dba6e34502aff8df6bab2f1183ef40bc83a0b))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @liebstoeckel/live-server bumped to 0.2.0
