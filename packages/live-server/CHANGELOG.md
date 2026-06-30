# Changelog

## [0.3.7](https://github.com/liebstoeckel/liebstoeckel-app/compare/live-server-v0.3.6...live-server-v0.3.7) (2026-06-30)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @liebstoeckel/engine bumped to 0.3.7
    * @liebstoeckel/thumbnails bumped to 0.3.7

## [0.3.6](https://github.com/liebstoeckel/liebstoeckel-app/compare/live-server-v0.3.5...live-server-v0.3.6) (2026-06-24)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @liebstoeckel/engine bumped to 0.3.6
    * @liebstoeckel/thumbnails bumped to 0.3.6

## [0.3.5](https://github.com/liebstoeckel/liebstoeckel-app/compare/live-server-v0.3.4...live-server-v0.3.5) (2026-06-22)


### Features

* **build:** caret cross-dep ranges + single-copy guard ((internal ADR)) ([d3a9e28](https://github.com/liebstoeckel/liebstoeckel-app/commit/d3a9e28049b79b7ffed66ecae2ba8fd7be2932ce))


### Bug Fixes

* **live:** harden live sessions against untrusted audience input ([24c2074](https://github.com/liebstoeckel/liebstoeckel-app/commit/24c20749b005a31b05a702807fbb926b34c056d4))
* **oss-release:** clear pre-release review blockers across OSS packages ([fd55fb0](https://github.com/liebstoeckel/liebstoeckel-app/commit/fd55fb00715fdb4a9aaf9fe49f75240932d1fc8f))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @liebstoeckel/engine bumped to 0.3.5
    * @liebstoeckel/plugin-sdk bumped to 0.3.4
    * @liebstoeckel/thumbnails bumped to 0.3.5

## [0.3.4](https://github.com/liebstoeckel/liebstoeckel-app/compare/live-server-v0.3.3...live-server-v0.3.4) (2026-06-13)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @liebstoeckel/engine bumped to 0.3.4
    * @liebstoeckel/thumbnails bumped to 0.3.4

## [0.3.3](https://github.com/liebstoeckel/liebstoeckel-app/compare/live-server-v0.3.2...live-server-v0.3.3) (2026-06-09)


### Miscellaneous Chores

* **live-server:** Synchronize liebstoeckel versions


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @liebstoeckel/engine bumped to 0.3.3
    * @liebstoeckel/plugin-sdk bumped to 0.3.3
    * @liebstoeckel/thumbnails bumped to 0.3.3
  * devDependencies
    * @liebstoeckel/plugin-poll bumped to 0.3.3

## [0.3.2](https://github.com/liebstoeckel/liebstoeckel-app/compare/live-server-v0.3.1...live-server-v0.3.2) (2026-06-07)


### Miscellaneous Chores

* **live-server:** Synchronize liebstoeckel versions


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @liebstoeckel/engine bumped to 0.3.2
    * @liebstoeckel/plugin-sdk bumped to 0.3.2
    * @liebstoeckel/thumbnails bumped to 0.3.2
  * devDependencies
    * @liebstoeckel/plugin-poll bumped to 0.3.2

## [0.3.1](https://github.com/liebstoeckel/liebstoeckel-app/compare/live-server-v0.3.0...live-server-v0.3.1) (2026-06-07)


### ⚠ BREAKING CHANGES

* npm scope, CLI binary, env vars and runtime globals renamed.

### Features

* **cli:** scaffold real ^version deck deps; version framework 0.1.0 ((internal ADR)) ([ebf6b82](https://github.com/liebstoeckel/liebstoeckel-app/commit/ebf6b82acda1f8f274cd3dd42b822a1b88968e68))
* **cli:** umbrella present-it CLI with deck scaffolding ([92e03b0](https://github.com/liebstoeckel/liebstoeckel-app/commit/92e03b0b23f213bbf53261abb21fd74535a533d3))
* **featureset-3:** build-time thumbnails + secure public relay ([dd3feba](https://github.com/liebstoeckel/liebstoeckel-app/commit/dd3febadd8641f64657d5298b29ea5242f34bc64))
* **live:** audience write-scope enforcement for hosted sessions ((internal ADR), phase 1) ([c65e4ea](https://github.com/liebstoeckel/liebstoeckel-app/commit/c65e4ea11ac1780e9542d5fabfb57e6ad36e132a))
* **live:** capture slide thumbnails by default ([4ecb729](https://github.com/liebstoeckel/liebstoeckel-app/commit/4ecb7292c8d3a8ee33e9257d499b8b08cf85803c))
* **live:** recovery primitives — crash detection + reconnect escalation ((internal ticket)) ([ec86815](https://github.com/liebstoeckel/liebstoeckel-app/commit/ec8681564c361853006e9d1514c605caf051e64d))
* **live:** white-label the live audience view ((internal ticket), phase B) ([eddac49](https://github.com/liebstoeckel/liebstoeckel-app/commit/eddac49cc0b4218ca142356058e36b25343eff53))
* **relay:** hosted audience enforcement + snapshot persistence ((internal ADR), phase 7) ([ab1a54f](https://github.com/liebstoeckel/liebstoeckel-app/commit/ab1a54f84184928935eef6c5823cb3a7e8907545))


### Bug Fixes

* **ci:** resolve live-server integration test deps without a release cycle ([057bd3a](https://github.com/liebstoeckel/liebstoeckel-app/commit/057bd3aed8b55b3e3b06760e96a7f6c5ddb7ae55))
* **cli:** fix --help on subcommands + docs/usability papercuts (audit) ([b68882b](https://github.com/liebstoeckel/liebstoeckel-app/commit/b68882beaa60a714ac215e3124f13a7209a74b35))
* **deps:** keep exact workspace pins for cross-deps (revert caret) ([6526a68](https://github.com/liebstoeckel/liebstoeckel-app/commit/6526a68b799a724bfbe6e9467e79d531c9227cb5))
* **deps:** use caret ranges for workspace cross-deps ([3675d30](https://github.com/liebstoeckel/liebstoeckel-app/commit/3675d30829a97ffcf9a47c4e8d9f9f505d86b4a4))
* **live-server:** drop terminal QR from the live CLI ([d23b3d3](https://github.com/liebstoeckel/liebstoeckel-app/commit/d23b3d365848a82db3443a6faf1a54b77ceda889))
* **live-server:** drop test-only [@liebstoeckel](https://github.com/liebstoeckel) devDeps (breaks release graph cycle) ([97c7ba1](https://github.com/liebstoeckel/liebstoeckel-app/commit/97c7ba195adbad8f8fbf996cdeafff8883092a83))
* **live-server:** pass instance to the server ctx ((internal ADR)) ([e3b3e11](https://github.com/liebstoeckel/liebstoeckel-app/commit/e3b3e117a63dcd7d931bb429facfe31cb03986cd))
* **live:** guard relay broadcast + half-open detection (keepalive + watchdog) ([6c2db23](https://github.com/liebstoeckel/liebstoeckel-app/commit/6c2db234e659c670968f62ead897133af061bf5c))


### Miscellaneous Chores

* force release 0.3.1 (supersede broken 0.3.0 closure) ([87f1142](https://github.com/liebstoeckel/liebstoeckel-app/commit/87f1142a44d814ab86f2112a2e9c8dcd705fb57c))


### Code Refactoring

* rename present-it → liebstoeckel ([1c1dba6](https://github.com/liebstoeckel/liebstoeckel-app/commit/1c1dba6e34502aff8df6bab2f1183ef40bc83a0b))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @liebstoeckel/engine bumped to 0.3.1
    * @liebstoeckel/plugin-sdk bumped to 0.3.1
    * @liebstoeckel/thumbnails bumped to 0.3.1
  * devDependencies
    * @liebstoeckel/plugin-poll bumped to 0.3.1

## [0.3.0](https://github.com/liebstoeckel/liebstoeckel-app/compare/live-server-v0.2.1...live-server-v0.3.0) (2026-06-07)


### Bug Fixes

* **deps:** keep exact workspace pins for cross-deps (revert caret) ([6526a68](https://github.com/liebstoeckel/liebstoeckel-app/commit/6526a68b799a724bfbe6e9467e79d531c9227cb5))
* **deps:** use caret ranges for workspace cross-deps ([3675d30](https://github.com/liebstoeckel/liebstoeckel-app/commit/3675d30829a97ffcf9a47c4e8d9f9f505d86b4a4))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @liebstoeckel/engine bumped to 0.3.0
    * @liebstoeckel/plugin-sdk bumped to 0.3.0
    * @liebstoeckel/thumbnails bumped to 0.3.0
  * devDependencies
    * @liebstoeckel/plugin-poll bumped to 0.3.0

## [0.2.1](https://github.com/liebstoeckel/liebstoeckel-app/compare/live-server-v0.2.0...live-server-v0.2.1) (2026-06-07)


### Features

* **live:** recovery primitives — crash detection + reconnect escalation ((internal ticket)) ([ec86815](https://github.com/liebstoeckel/liebstoeckel-app/commit/ec8681564c361853006e9d1514c605caf051e64d))


### Bug Fixes

* **cli:** fix --help on subcommands + docs/usability papercuts (audit) ([b68882b](https://github.com/liebstoeckel/liebstoeckel-app/commit/b68882beaa60a714ac215e3124f13a7209a74b35))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @liebstoeckel/engine bumped to 0.2.1
    * @liebstoeckel/thumbnails bumped to 0.2.1

## [0.2.0](https://github.com/liebstoeckel/liebstoeckel-app/compare/live-server-v0.1.0...live-server-v0.2.0) (2026-06-02)


### ⚠ BREAKING CHANGES

* npm scope, CLI binary, env vars and runtime globals renamed.

### Features

* **cli:** scaffold real ^version deck deps; version framework 0.1.0 ((internal ADR)) ([ebf6b82](https://github.com/liebstoeckel/liebstoeckel-app/commit/ebf6b82acda1f8f274cd3dd42b822a1b88968e68))
* **cli:** umbrella present-it CLI with deck scaffolding ([92e03b0](https://github.com/liebstoeckel/liebstoeckel-app/commit/92e03b0b23f213bbf53261abb21fd74535a533d3))
* **featureset-3:** build-time thumbnails + secure public relay ([dd3feba](https://github.com/liebstoeckel/liebstoeckel-app/commit/dd3febadd8641f64657d5298b29ea5242f34bc64))
* **live:** audience write-scope enforcement for hosted sessions ((internal ADR), phase 1) ([c65e4ea](https://github.com/liebstoeckel/liebstoeckel-app/commit/c65e4ea11ac1780e9542d5fabfb57e6ad36e132a))
* **live:** capture slide thumbnails by default ([4ecb729](https://github.com/liebstoeckel/liebstoeckel-app/commit/4ecb7292c8d3a8ee33e9257d499b8b08cf85803c))
* **live:** white-label the live audience view ((internal ticket), phase B) ([eddac49](https://github.com/liebstoeckel/liebstoeckel-app/commit/eddac49cc0b4218ca142356058e36b25343eff53))
* **relay:** hosted audience enforcement + snapshot persistence ((internal ADR), phase 7) ([ab1a54f](https://github.com/liebstoeckel/liebstoeckel-app/commit/ab1a54f84184928935eef6c5823cb3a7e8907545))


### Bug Fixes

* **ci:** resolve live-server integration test deps without a release cycle ([057bd3a](https://github.com/liebstoeckel/liebstoeckel-app/commit/057bd3aed8b55b3e3b06760e96a7f6c5ddb7ae55))
* **live-server:** drop terminal QR from the live CLI ([d23b3d3](https://github.com/liebstoeckel/liebstoeckel-app/commit/d23b3d365848a82db3443a6faf1a54b77ceda889))
* **live-server:** drop test-only [@liebstoeckel](https://github.com/liebstoeckel) devDeps (breaks release graph cycle) ([97c7ba1](https://github.com/liebstoeckel/liebstoeckel-app/commit/97c7ba195adbad8f8fbf996cdeafff8883092a83))
* **live-server:** pass instance to the server ctx ((internal ADR)) ([e3b3e11](https://github.com/liebstoeckel/liebstoeckel-app/commit/e3b3e117a63dcd7d931bb429facfe31cb03986cd))
* **live:** guard relay broadcast + half-open detection (keepalive + watchdog) ([6c2db23](https://github.com/liebstoeckel/liebstoeckel-app/commit/6c2db234e659c670968f62ead897133af061bf5c))


### Code Refactoring

* rename present-it → liebstoeckel ([1c1dba6](https://github.com/liebstoeckel/liebstoeckel-app/commit/1c1dba6e34502aff8df6bab2f1183ef40bc83a0b))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @liebstoeckel/engine bumped to 0.2.0
    * @liebstoeckel/plugin-sdk bumped to 0.2.0
    * @liebstoeckel/thumbnails bumped to 0.2.0
  * devDependencies
    * @liebstoeckel/plugin-poll bumped to 0.2.0
