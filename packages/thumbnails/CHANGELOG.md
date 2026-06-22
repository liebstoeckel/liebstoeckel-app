# Changelog

## [0.3.5](https://github.com/liebstoeckel/liebstoeckel-app/compare/thumbnails-v0.3.4...thumbnails-v0.3.5) (2026-06-22)


### Features

* **build:** caret cross-dep ranges + single-copy guard ((internal ADR)) ([d3a9e28](https://github.com/liebstoeckel/liebstoeckel-app/commit/d3a9e28049b79b7ffed66ecae2ba8fd7be2932ce))
* **build:** stamp engine + CLI versions into built decks ([fd3422f](https://github.com/liebstoeckel/liebstoeckel-app/commit/fd3422f8fa53fd43f9b7eb3c7672582f05137d52))


### Bug Fixes

* address pre-1.0 release QA findings across CLI, engine, docs ([598b41f](https://github.com/liebstoeckel/liebstoeckel-app/commit/598b41f2cf5812638a3426a4930c24e9500a469e))
* **oss-release:** clear pre-release review blockers across OSS packages ([fd55fb0](https://github.com/liebstoeckel/liebstoeckel-app/commit/fd55fb00715fdb4a9aaf9fe49f75240932d1fc8f))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @liebstoeckel/engine bumped to 0.3.5

## [0.3.4](https://github.com/liebstoeckel/liebstoeckel-app/compare/thumbnails-v0.3.3...thumbnails-v0.3.4) (2026-06-13)


### Features

* **engine,cli:** embed bundle-time third-party license notices in every deck ([c165bf2](https://github.com/liebstoeckel/liebstoeckel-app/commit/c165bf284168b19a34779a79a4dd59656de55429))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @liebstoeckel/engine bumped to 0.3.4

## [0.3.3](https://github.com/liebstoeckel/liebstoeckel-app/compare/thumbnails-v0.3.2...thumbnails-v0.3.3) (2026-06-09)


### ⚠ BREAKING CHANGES

* npm scope, CLI binary, env vars and runtime globals renamed.

### Features

* **cli:** scaffold real ^version deck deps; version framework 0.1.0 ((internal ADR)) ([ebf6b82](https://github.com/liebstoeckel/liebstoeckel-app/commit/ebf6b82acda1f8f274cd3dd42b822a1b88968e68))
* **cli:** umbrella present-it CLI with deck scaffolding ([92e03b0](https://github.com/liebstoeckel/liebstoeckel-app/commit/92e03b0b23f213bbf53261abb21fd74535a533d3))
* **deck:** build output as &lt;slug&gt;.html + server-side title precedence ((internal ADR)) ([968ec51](https://github.com/liebstoeckel/liebstoeckel-app/commit/968ec513e017002fbeef03c76d72c3961156c406))
* **engine,cli:** inline source package — compiled decks are ejectable ((internal ADR)) ([370fba0](https://github.com/liebstoeckel/liebstoeckel-app/commit/370fba0078b77c7dc8122c2d3e8045ebedfc888a))
* **export:** PNG/PDF slide export — single slide, range, or whole deck ([430a687](https://github.com/liebstoeckel/liebstoeckel-app/commit/430a687704ba94910317e7d15ec78142f199903d))
* **featureset-3:** build-time thumbnails + secure public relay ([dd3feba](https://github.com/liebstoeckel/liebstoeckel-app/commit/dd3febadd8641f64657d5298b29ea5242f34bc64))
* **plugins:** audience Q&A + live reactions ([d7f0055](https://github.com/liebstoeckel/liebstoeckel-app/commit/d7f00554d486bf20f7229044bb874813c1e29f8e))
* **thumbnails:** encode WebP via Bun.Image (default), drop JPEG-only ([2d8408e](https://github.com/liebstoeckel/liebstoeckel-app/commit/2d8408e668fe2507687967bb9aed20f0c25e6548))
* **thumbnails:** generate by default at build time (graceful skip) ([27b3b75](https://github.com/liebstoeckel/liebstoeckel-app/commit/27b3b75a2f0f2658821098c016499eb478cd187c))
* **thumbnails:** render plugin fallbacks in captured thumbnails ([d9f2df9](https://github.com/liebstoeckel/liebstoeckel-app/commit/d9f2df9622700968c81fc20634c3feacfe7f20bb))


### Bug Fixes

* **cli:** fix --help on subcommands + docs/usability papercuts (audit) ([b68882b](https://github.com/liebstoeckel/liebstoeckel-app/commit/b68882beaa60a714ac215e3124f13a7209a74b35))
* **deps:** keep exact workspace pins for cross-deps (revert caret) ([6526a68](https://github.com/liebstoeckel/liebstoeckel-app/commit/6526a68b799a724bfbe6e9467e79d531c9227cb5))
* **deps:** use caret ranges for workspace cross-deps ([3675d30](https://github.com/liebstoeckel/liebstoeckel-app/commit/3675d30829a97ffcf9a47c4e8d9f9f505d86b4a4))
* **presenter:** render previews live (crisp), raise thumbnail res to native 1280x720 ([29c7a42](https://github.com/liebstoeckel/liebstoeckel-app/commit/29c7a42e75b2cbc77ee4101593d56738f65ab749))


### Miscellaneous Chores

* force release 0.3.1 (supersede broken 0.3.0 closure) ([87f1142](https://github.com/liebstoeckel/liebstoeckel-app/commit/87f1142a44d814ab86f2112a2e9c8dcd705fb57c))


### Code Refactoring

* rename present-it → liebstoeckel ([1c1dba6](https://github.com/liebstoeckel/liebstoeckel-app/commit/1c1dba6e34502aff8df6bab2f1183ef40bc83a0b))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @liebstoeckel/engine bumped to 0.3.3

## [0.3.2](https://github.com/liebstoeckel/liebstoeckel-app/compare/thumbnails-v0.3.1...thumbnails-v0.3.2) (2026-06-07)


### ⚠ BREAKING CHANGES

* npm scope, CLI binary, env vars and runtime globals renamed.

### Features

* **cli:** scaffold real ^version deck deps; version framework 0.1.0 ((internal ADR)) ([ebf6b82](https://github.com/liebstoeckel/liebstoeckel-app/commit/ebf6b82acda1f8f274cd3dd42b822a1b88968e68))
* **cli:** umbrella present-it CLI with deck scaffolding ([92e03b0](https://github.com/liebstoeckel/liebstoeckel-app/commit/92e03b0b23f213bbf53261abb21fd74535a533d3))
* **deck:** build output as &lt;slug&gt;.html + server-side title precedence ((internal ADR)) ([968ec51](https://github.com/liebstoeckel/liebstoeckel-app/commit/968ec513e017002fbeef03c76d72c3961156c406))
* **engine,cli:** inline source package — compiled decks are ejectable ((internal ADR)) ([370fba0](https://github.com/liebstoeckel/liebstoeckel-app/commit/370fba0078b77c7dc8122c2d3e8045ebedfc888a))
* **export:** PNG/PDF slide export — single slide, range, or whole deck ([430a687](https://github.com/liebstoeckel/liebstoeckel-app/commit/430a687704ba94910317e7d15ec78142f199903d))
* **featureset-3:** build-time thumbnails + secure public relay ([dd3feba](https://github.com/liebstoeckel/liebstoeckel-app/commit/dd3febadd8641f64657d5298b29ea5242f34bc64))
* **plugins:** audience Q&A + live reactions ([d7f0055](https://github.com/liebstoeckel/liebstoeckel-app/commit/d7f00554d486bf20f7229044bb874813c1e29f8e))
* **thumbnails:** encode WebP via Bun.Image (default), drop JPEG-only ([2d8408e](https://github.com/liebstoeckel/liebstoeckel-app/commit/2d8408e668fe2507687967bb9aed20f0c25e6548))
* **thumbnails:** generate by default at build time (graceful skip) ([27b3b75](https://github.com/liebstoeckel/liebstoeckel-app/commit/27b3b75a2f0f2658821098c016499eb478cd187c))
* **thumbnails:** render plugin fallbacks in captured thumbnails ([d9f2df9](https://github.com/liebstoeckel/liebstoeckel-app/commit/d9f2df9622700968c81fc20634c3feacfe7f20bb))


### Bug Fixes

* **cli:** fix --help on subcommands + docs/usability papercuts (audit) ([b68882b](https://github.com/liebstoeckel/liebstoeckel-app/commit/b68882beaa60a714ac215e3124f13a7209a74b35))
* **deps:** keep exact workspace pins for cross-deps (revert caret) ([6526a68](https://github.com/liebstoeckel/liebstoeckel-app/commit/6526a68b799a724bfbe6e9467e79d531c9227cb5))
* **deps:** use caret ranges for workspace cross-deps ([3675d30](https://github.com/liebstoeckel/liebstoeckel-app/commit/3675d30829a97ffcf9a47c4e8d9f9f505d86b4a4))
* **presenter:** render previews live (crisp), raise thumbnail res to native 1280x720 ([29c7a42](https://github.com/liebstoeckel/liebstoeckel-app/commit/29c7a42e75b2cbc77ee4101593d56738f65ab749))


### Miscellaneous Chores

* force release 0.3.1 (supersede broken 0.3.0 closure) ([87f1142](https://github.com/liebstoeckel/liebstoeckel-app/commit/87f1142a44d814ab86f2112a2e9c8dcd705fb57c))


### Code Refactoring

* rename present-it → liebstoeckel ([1c1dba6](https://github.com/liebstoeckel/liebstoeckel-app/commit/1c1dba6e34502aff8df6bab2f1183ef40bc83a0b))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @liebstoeckel/engine bumped to 0.3.2

## [0.3.1](https://github.com/liebstoeckel/liebstoeckel-app/compare/thumbnails-v0.3.0...thumbnails-v0.3.1) (2026-06-07)


### ⚠ BREAKING CHANGES

* npm scope, CLI binary, env vars and runtime globals renamed.

### Features

* **cli:** scaffold real ^version deck deps; version framework 0.1.0 ((internal ADR)) ([ebf6b82](https://github.com/liebstoeckel/liebstoeckel-app/commit/ebf6b82acda1f8f274cd3dd42b822a1b88968e68))
* **cli:** umbrella present-it CLI with deck scaffolding ([92e03b0](https://github.com/liebstoeckel/liebstoeckel-app/commit/92e03b0b23f213bbf53261abb21fd74535a533d3))
* **deck:** build output as &lt;slug&gt;.html + server-side title precedence ((internal ADR)) ([968ec51](https://github.com/liebstoeckel/liebstoeckel-app/commit/968ec513e017002fbeef03c76d72c3961156c406))
* **engine,cli:** inline source package — compiled decks are ejectable ((internal ADR)) ([370fba0](https://github.com/liebstoeckel/liebstoeckel-app/commit/370fba0078b77c7dc8122c2d3e8045ebedfc888a))
* **export:** PNG/PDF slide export — single slide, range, or whole deck ([430a687](https://github.com/liebstoeckel/liebstoeckel-app/commit/430a687704ba94910317e7d15ec78142f199903d))
* **featureset-3:** build-time thumbnails + secure public relay ([dd3feba](https://github.com/liebstoeckel/liebstoeckel-app/commit/dd3febadd8641f64657d5298b29ea5242f34bc64))
* **plugins:** audience Q&A + live reactions ([d7f0055](https://github.com/liebstoeckel/liebstoeckel-app/commit/d7f00554d486bf20f7229044bb874813c1e29f8e))
* **thumbnails:** encode WebP via Bun.Image (default), drop JPEG-only ([2d8408e](https://github.com/liebstoeckel/liebstoeckel-app/commit/2d8408e668fe2507687967bb9aed20f0c25e6548))
* **thumbnails:** generate by default at build time (graceful skip) ([27b3b75](https://github.com/liebstoeckel/liebstoeckel-app/commit/27b3b75a2f0f2658821098c016499eb478cd187c))
* **thumbnails:** render plugin fallbacks in captured thumbnails ([d9f2df9](https://github.com/liebstoeckel/liebstoeckel-app/commit/d9f2df9622700968c81fc20634c3feacfe7f20bb))


### Bug Fixes

* **cli:** fix --help on subcommands + docs/usability papercuts (audit) ([b68882b](https://github.com/liebstoeckel/liebstoeckel-app/commit/b68882beaa60a714ac215e3124f13a7209a74b35))
* **deps:** keep exact workspace pins for cross-deps (revert caret) ([6526a68](https://github.com/liebstoeckel/liebstoeckel-app/commit/6526a68b799a724bfbe6e9467e79d531c9227cb5))
* **deps:** use caret ranges for workspace cross-deps ([3675d30](https://github.com/liebstoeckel/liebstoeckel-app/commit/3675d30829a97ffcf9a47c4e8d9f9f505d86b4a4))
* **presenter:** render previews live (crisp), raise thumbnail res to native 1280x720 ([29c7a42](https://github.com/liebstoeckel/liebstoeckel-app/commit/29c7a42e75b2cbc77ee4101593d56738f65ab749))


### Miscellaneous Chores

* force release 0.3.1 (supersede broken 0.3.0 closure) ([87f1142](https://github.com/liebstoeckel/liebstoeckel-app/commit/87f1142a44d814ab86f2112a2e9c8dcd705fb57c))


### Code Refactoring

* rename present-it → liebstoeckel ([1c1dba6](https://github.com/liebstoeckel/liebstoeckel-app/commit/1c1dba6e34502aff8df6bab2f1183ef40bc83a0b))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @liebstoeckel/engine bumped to 0.3.1

## [0.3.0](https://github.com/liebstoeckel/liebstoeckel-app/compare/thumbnails-v0.2.1...thumbnails-v0.3.0) (2026-06-07)


### ⚠ BREAKING CHANGES

* npm scope, CLI binary, env vars and runtime globals renamed.

### Features

* **cli:** scaffold real ^version deck deps; version framework 0.1.0 ((internal ADR)) ([ebf6b82](https://github.com/liebstoeckel/liebstoeckel-app/commit/ebf6b82acda1f8f274cd3dd42b822a1b88968e68))
* **cli:** umbrella present-it CLI with deck scaffolding ([92e03b0](https://github.com/liebstoeckel/liebstoeckel-app/commit/92e03b0b23f213bbf53261abb21fd74535a533d3))
* **deck:** build output as &lt;slug&gt;.html + server-side title precedence ((internal ADR)) ([968ec51](https://github.com/liebstoeckel/liebstoeckel-app/commit/968ec513e017002fbeef03c76d72c3961156c406))
* **engine,cli:** inline source package — compiled decks are ejectable ((internal ADR)) ([370fba0](https://github.com/liebstoeckel/liebstoeckel-app/commit/370fba0078b77c7dc8122c2d3e8045ebedfc888a))
* **export:** PNG/PDF slide export — single slide, range, or whole deck ([430a687](https://github.com/liebstoeckel/liebstoeckel-app/commit/430a687704ba94910317e7d15ec78142f199903d))
* **featureset-3:** build-time thumbnails + secure public relay ([dd3feba](https://github.com/liebstoeckel/liebstoeckel-app/commit/dd3febadd8641f64657d5298b29ea5242f34bc64))
* **plugins:** audience Q&A + live reactions ([d7f0055](https://github.com/liebstoeckel/liebstoeckel-app/commit/d7f00554d486bf20f7229044bb874813c1e29f8e))
* **thumbnails:** encode WebP via Bun.Image (default), drop JPEG-only ([2d8408e](https://github.com/liebstoeckel/liebstoeckel-app/commit/2d8408e668fe2507687967bb9aed20f0c25e6548))
* **thumbnails:** generate by default at build time (graceful skip) ([27b3b75](https://github.com/liebstoeckel/liebstoeckel-app/commit/27b3b75a2f0f2658821098c016499eb478cd187c))
* **thumbnails:** render plugin fallbacks in captured thumbnails ([d9f2df9](https://github.com/liebstoeckel/liebstoeckel-app/commit/d9f2df9622700968c81fc20634c3feacfe7f20bb))


### Bug Fixes

* **cli:** fix --help on subcommands + docs/usability papercuts (audit) ([b68882b](https://github.com/liebstoeckel/liebstoeckel-app/commit/b68882beaa60a714ac215e3124f13a7209a74b35))
* **deps:** keep exact workspace pins for cross-deps (revert caret) ([6526a68](https://github.com/liebstoeckel/liebstoeckel-app/commit/6526a68b799a724bfbe6e9467e79d531c9227cb5))
* **deps:** use caret ranges for workspace cross-deps ([3675d30](https://github.com/liebstoeckel/liebstoeckel-app/commit/3675d30829a97ffcf9a47c4e8d9f9f505d86b4a4))
* **presenter:** render previews live (crisp), raise thumbnail res to native 1280x720 ([29c7a42](https://github.com/liebstoeckel/liebstoeckel-app/commit/29c7a42e75b2cbc77ee4101593d56738f65ab749))


### Code Refactoring

* rename present-it → liebstoeckel ([1c1dba6](https://github.com/liebstoeckel/liebstoeckel-app/commit/1c1dba6e34502aff8df6bab2f1183ef40bc83a0b))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @liebstoeckel/engine bumped to 0.3.0

## [0.2.1](https://github.com/liebstoeckel/liebstoeckel-app/compare/thumbnails-v0.2.0...thumbnails-v0.2.1) (2026-06-07)


### Features

* **deck:** build output as &lt;slug&gt;.html + server-side title precedence ((internal ADR)) ([968ec51](https://github.com/liebstoeckel/liebstoeckel-app/commit/968ec513e017002fbeef03c76d72c3961156c406))


### Bug Fixes

* **cli:** fix --help on subcommands + docs/usability papercuts (audit) ([b68882b](https://github.com/liebstoeckel/liebstoeckel-app/commit/b68882beaa60a714ac215e3124f13a7209a74b35))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @liebstoeckel/engine bumped to 0.2.1

## [0.2.0](https://github.com/liebstoeckel/liebstoeckel-app/compare/thumbnails-v0.1.0...thumbnails-v0.2.0) (2026-06-02)


### ⚠ BREAKING CHANGES

* npm scope, CLI binary, env vars and runtime globals renamed.

### Features

* **cli:** scaffold real ^version deck deps; version framework 0.1.0 ((internal ADR)) ([ebf6b82](https://github.com/liebstoeckel/liebstoeckel-app/commit/ebf6b82acda1f8f274cd3dd42b822a1b88968e68))
* **cli:** umbrella present-it CLI with deck scaffolding ([92e03b0](https://github.com/liebstoeckel/liebstoeckel-app/commit/92e03b0b23f213bbf53261abb21fd74535a533d3))
* **engine,cli:** inline source package — compiled decks are ejectable ((internal ADR)) ([370fba0](https://github.com/liebstoeckel/liebstoeckel-app/commit/370fba0078b77c7dc8122c2d3e8045ebedfc888a))
* **export:** PNG/PDF slide export — single slide, range, or whole deck ([430a687](https://github.com/liebstoeckel/liebstoeckel-app/commit/430a687704ba94910317e7d15ec78142f199903d))
* **featureset-3:** build-time thumbnails + secure public relay ([dd3feba](https://github.com/liebstoeckel/liebstoeckel-app/commit/dd3febadd8641f64657d5298b29ea5242f34bc64))
* **plugins:** audience Q&A + live reactions ([d7f0055](https://github.com/liebstoeckel/liebstoeckel-app/commit/d7f00554d486bf20f7229044bb874813c1e29f8e))
* **thumbnails:** encode WebP via Bun.Image (default), drop JPEG-only ([2d8408e](https://github.com/liebstoeckel/liebstoeckel-app/commit/2d8408e668fe2507687967bb9aed20f0c25e6548))
* **thumbnails:** generate by default at build time (graceful skip) ([27b3b75](https://github.com/liebstoeckel/liebstoeckel-app/commit/27b3b75a2f0f2658821098c016499eb478cd187c))
* **thumbnails:** render plugin fallbacks in captured thumbnails ([d9f2df9](https://github.com/liebstoeckel/liebstoeckel-app/commit/d9f2df9622700968c81fc20634c3feacfe7f20bb))


### Bug Fixes

* **presenter:** render previews live (crisp), raise thumbnail res to native 1280x720 ([29c7a42](https://github.com/liebstoeckel/liebstoeckel-app/commit/29c7a42e75b2cbc77ee4101593d56738f65ab749))


### Code Refactoring

* rename present-it → liebstoeckel ([1c1dba6](https://github.com/liebstoeckel/liebstoeckel-app/commit/1c1dba6e34502aff8df6bab2f1183ef40bc83a0b))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @liebstoeckel/engine bumped to 0.2.0
