# Changelog

## [0.3.4](https://github.com/liebstoeckel/liebstoeckel-app/compare/plugin-reactions-v0.3.3...plugin-reactions-v0.3.4) (2026-06-22)


### Features

* **build:** caret cross-dep ranges + single-copy guard ((internal ADR)) ([d3a9e28](https://github.com/liebstoeckel/liebstoeckel-app/commit/d3a9e28049b79b7ffed66ecae2ba8fd7be2932ce))


### Bug Fixes

* **oss-release:** clear pre-release review blockers across OSS packages ([fd55fb0](https://github.com/liebstoeckel/liebstoeckel-app/commit/fd55fb00715fdb4a9aaf9fe49f75240932d1fc8f))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @liebstoeckel/plugin-sdk bumped to 0.3.4
    * @liebstoeckel/plugin-ui bumped to 0.3.4

## [0.3.3](https://github.com/liebstoeckel/liebstoeckel-app/compare/plugin-reactions-v0.3.2...plugin-reactions-v0.3.3) (2026-06-09)


### Miscellaneous Chores

* **plugin-reactions:** Synchronize liebstoeckel versions


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @liebstoeckel/plugin-sdk bumped to 0.3.3
    * @liebstoeckel/plugin-ui bumped to 0.3.3

## [0.3.2](https://github.com/liebstoeckel/liebstoeckel-app/compare/plugin-reactions-v0.3.1...plugin-reactions-v0.3.2) (2026-06-07)


### Miscellaneous Chores

* **plugin-reactions:** Synchronize liebstoeckel versions


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @liebstoeckel/plugin-sdk bumped to 0.3.2
    * @liebstoeckel/plugin-ui bumped to 0.3.2

## [0.3.1](https://github.com/liebstoeckel/liebstoeckel-app/compare/plugin-reactions-v0.3.0...plugin-reactions-v0.3.1) (2026-06-07)


### ⚠ BREAKING CHANGES

* npm scope, CLI binary, env vars and runtime globals renamed.

### Features

* **cli:** scaffold real ^version deck deps; version framework 0.1.0 ((internal ADR)) ([ebf6b82](https://github.com/liebstoeckel/liebstoeckel-app/commit/ebf6b82acda1f8f274cd3dd42b822a1b88968e68))
* **engine,plugins:** consistent control icons + mobile chrome overflow ((internal ADR)) ([05ae897](https://github.com/liebstoeckel/liebstoeckel-app/commit/05ae89720ef05cb11e1ba2fa518f3a8c7080cc90))
* **live:** audience write-scope enforcement for hosted sessions ((internal ADR), phase 1) ([c65e4ea](https://github.com/liebstoeckel/liebstoeckel-app/commit/c65e4ea11ac1780e9542d5fabfb57e6ad36e132a))
* **mobile:** tap-to-interact plugin breakout on touch screens ([584174d](https://github.com/liebstoeckel/liebstoeckel-app/commit/584174d26479ef02889664770b62cf0b6554cd79))
* **plugin-sdk:** instance-keyed state + plugin index + surface fields ([aac6c2b](https://github.com/liebstoeckel/liebstoeckel-app/commit/aac6c2bb610aa4fa65ec1d49c0a7a27990fe9163))
* **plugins:** audience Q&A + live reactions ([d7f0055](https://github.com/liebstoeckel/liebstoeckel-app/commit/d7f00554d486bf20f7229044bb874813c1e29f8e))
* **plugins:** deck-wide global plugin surfaces (overlay/control/panel) ([6068dcb](https://github.com/liebstoeckel/liebstoeckel-app/commit/6068dcb757bafe56905a078f50eac5544ef81ef4))


### Bug Fixes

* **deps:** keep exact workspace pins for cross-deps (revert caret) ([6526a68](https://github.com/liebstoeckel/liebstoeckel-app/commit/6526a68b799a724bfbe6e9467e79d531c9227cb5))
* **deps:** use caret ranges for workspace cross-deps ([3675d30](https://github.com/liebstoeckel/liebstoeckel-app/commit/3675d30829a97ffcf9a47c4e8d9f9f505d86b4a4))
* **reactions:** linger longer + open in a non-blurring popover ([94ce202](https://github.com/liebstoeckel/liebstoeckel-app/commit/94ce202ff302b67bcd5a04656e525c2f6c3d1ef2))


### Miscellaneous Chores

* force release 0.3.1 (supersede broken 0.3.0 closure) ([87f1142](https://github.com/liebstoeckel/liebstoeckel-app/commit/87f1142a44d814ab86f2112a2e9c8dcd705fb57c))


### Code Refactoring

* rename present-it → liebstoeckel ([1c1dba6](https://github.com/liebstoeckel/liebstoeckel-app/commit/1c1dba6e34502aff8df6bab2f1183ef40bc83a0b))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @liebstoeckel/plugin-sdk bumped to 0.3.1
    * @liebstoeckel/plugin-ui bumped to 0.3.1

## [0.3.0](https://github.com/liebstoeckel/liebstoeckel-app/compare/plugin-reactions-v0.2.0...plugin-reactions-v0.3.0) (2026-06-07)


### Bug Fixes

* **deps:** keep exact workspace pins for cross-deps (revert caret) ([6526a68](https://github.com/liebstoeckel/liebstoeckel-app/commit/6526a68b799a724bfbe6e9467e79d531c9227cb5))
* **deps:** use caret ranges for workspace cross-deps ([3675d30](https://github.com/liebstoeckel/liebstoeckel-app/commit/3675d30829a97ffcf9a47c4e8d9f9f505d86b4a4))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @liebstoeckel/plugin-sdk bumped to 0.3.0
    * @liebstoeckel/plugin-ui bumped to 0.3.0

## [0.2.0](https://github.com/liebstoeckel/liebstoeckel-app/compare/plugin-reactions-v0.1.0...plugin-reactions-v0.2.0) (2026-06-02)


### ⚠ BREAKING CHANGES

* npm scope, CLI binary, env vars and runtime globals renamed.

### Features

* **cli:** scaffold real ^version deck deps; version framework 0.1.0 ((internal ADR)) ([ebf6b82](https://github.com/liebstoeckel/liebstoeckel-app/commit/ebf6b82acda1f8f274cd3dd42b822a1b88968e68))
* **engine,plugins:** consistent control icons + mobile chrome overflow ((internal ADR)) ([05ae897](https://github.com/liebstoeckel/liebstoeckel-app/commit/05ae89720ef05cb11e1ba2fa518f3a8c7080cc90))
* **live:** audience write-scope enforcement for hosted sessions ((internal ADR), phase 1) ([c65e4ea](https://github.com/liebstoeckel/liebstoeckel-app/commit/c65e4ea11ac1780e9542d5fabfb57e6ad36e132a))
* **mobile:** tap-to-interact plugin breakout on touch screens ([584174d](https://github.com/liebstoeckel/liebstoeckel-app/commit/584174d26479ef02889664770b62cf0b6554cd79))
* **plugin-sdk:** instance-keyed state + plugin index + surface fields ([aac6c2b](https://github.com/liebstoeckel/liebstoeckel-app/commit/aac6c2bb610aa4fa65ec1d49c0a7a27990fe9163))
* **plugins:** audience Q&A + live reactions ([d7f0055](https://github.com/liebstoeckel/liebstoeckel-app/commit/d7f00554d486bf20f7229044bb874813c1e29f8e))
* **plugins:** deck-wide global plugin surfaces (overlay/control/panel) ([6068dcb](https://github.com/liebstoeckel/liebstoeckel-app/commit/6068dcb757bafe56905a078f50eac5544ef81ef4))


### Bug Fixes

* **reactions:** linger longer + open in a non-blurring popover ([94ce202](https://github.com/liebstoeckel/liebstoeckel-app/commit/94ce202ff302b67bcd5a04656e525c2f6c3d1ef2))


### Code Refactoring

* rename present-it → liebstoeckel ([1c1dba6](https://github.com/liebstoeckel/liebstoeckel-app/commit/1c1dba6e34502aff8df6bab2f1183ef40bc83a0b))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @liebstoeckel/plugin-sdk bumped to 0.2.0
    * @liebstoeckel/plugin-ui bumped to 0.2.0
