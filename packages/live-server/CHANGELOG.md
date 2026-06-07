# Changelog

## [0.2.1](https://github.com/limond/liebstoeckel-app/compare/live-server-v0.2.0...live-server-v0.2.1) (2026-06-07)


### Features

* **live:** recovery primitives — crash detection + reconnect escalation (ticket 0018) ([ec86815](https://github.com/limond/liebstoeckel-app/commit/ec8681564c361853006e9d1514c605caf051e64d))


### Bug Fixes

* **cli:** fix --help on subcommands + docs/usability papercuts (audit) ([b68882b](https://github.com/limond/liebstoeckel-app/commit/b68882beaa60a714ac215e3124f13a7209a74b35))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @liebstoeckel/engine bumped to 0.2.1
    * @liebstoeckel/thumbnails bumped to 0.2.1

## [0.2.0](https://github.com/limond/liebstoeckel-app/compare/live-server-v0.1.0...live-server-v0.2.0) (2026-06-02)


### ⚠ BREAKING CHANGES

* npm scope, CLI binary, env vars and runtime globals renamed.

### Features

* **cli:** scaffold real ^version deck deps; version framework 0.1.0 (ADR 0051) ([ebf6b82](https://github.com/limond/liebstoeckel-app/commit/ebf6b82acda1f8f274cd3dd42b822a1b88968e68))
* **cli:** umbrella present-it CLI with deck scaffolding ([92e03b0](https://github.com/limond/liebstoeckel-app/commit/92e03b0b23f213bbf53261abb21fd74535a533d3))
* **featureset-3:** build-time thumbnails + secure public relay ([dd3feba](https://github.com/limond/liebstoeckel-app/commit/dd3febadd8641f64657d5298b29ea5242f34bc64))
* **live:** audience write-scope enforcement for hosted sessions (ADR 0061, phase 1) ([c65e4ea](https://github.com/limond/liebstoeckel-app/commit/c65e4ea11ac1780e9542d5fabfb57e6ad36e132a))
* **live:** capture slide thumbnails by default ([4ecb729](https://github.com/limond/liebstoeckel-app/commit/4ecb7292c8d3a8ee33e9257d499b8b08cf85803c))
* **live:** white-label the live audience view (ticket 0015, phase B) ([eddac49](https://github.com/limond/liebstoeckel-app/commit/eddac49cc0b4218ca142356058e36b25343eff53))
* **relay:** hosted audience enforcement + snapshot persistence (ADR 0061, phase 7) ([ab1a54f](https://github.com/limond/liebstoeckel-app/commit/ab1a54f84184928935eef6c5823cb3a7e8907545))


### Bug Fixes

* **ci:** resolve live-server integration test deps without a release cycle ([057bd3a](https://github.com/limond/liebstoeckel-app/commit/057bd3aed8b55b3e3b06760e96a7f6c5ddb7ae55))
* **live-server:** drop terminal QR from the live CLI ([d23b3d3](https://github.com/limond/liebstoeckel-app/commit/d23b3d365848a82db3443a6faf1a54b77ceda889))
* **live-server:** drop test-only [@liebstoeckel](https://github.com/liebstoeckel) devDeps (breaks release graph cycle) ([97c7ba1](https://github.com/limond/liebstoeckel-app/commit/97c7ba195adbad8f8fbf996cdeafff8883092a83))
* **live-server:** pass instance to the server ctx (ADR 0034) ([e3b3e11](https://github.com/limond/liebstoeckel-app/commit/e3b3e117a63dcd7d931bb429facfe31cb03986cd))
* **live:** guard relay broadcast + half-open detection (keepalive + watchdog) ([6c2db23](https://github.com/limond/liebstoeckel-app/commit/6c2db234e659c670968f62ead897133af061bf5c))


### Code Refactoring

* rename present-it → liebstoeckel ([1c1dba6](https://github.com/limond/liebstoeckel-app/commit/1c1dba6e34502aff8df6bab2f1183ef40bc83a0b))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @liebstoeckel/engine bumped to 0.2.0
    * @liebstoeckel/plugin-sdk bumped to 0.2.0
    * @liebstoeckel/thumbnails bumped to 0.2.0
  * devDependencies
    * @liebstoeckel/plugin-poll bumped to 0.2.0
