# Changelog

## [0.3.0](https://github.com/limond/liebstoeckel-app/compare/plugin-qa-v0.2.0...plugin-qa-v0.3.0) (2026-06-07)


### Bug Fixes

* **deps:** keep exact workspace pins for cross-deps (revert caret) ([6526a68](https://github.com/limond/liebstoeckel-app/commit/6526a68b799a724bfbe6e9467e79d531c9227cb5))
* **deps:** use caret ranges for workspace cross-deps ([3675d30](https://github.com/limond/liebstoeckel-app/commit/3675d30829a97ffcf9a47c4e8d9f9f505d86b4a4))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @liebstoeckel/plugin-sdk bumped to 0.3.0
    * @liebstoeckel/plugin-ui bumped to 0.3.0

## [0.2.0](https://github.com/limond/liebstoeckel-app/compare/plugin-qa-v0.1.0...plugin-qa-v0.2.0) (2026-06-02)


### ⚠ BREAKING CHANGES

* npm scope, CLI binary, env vars and runtime globals renamed.

### Features

* **cli:** scaffold real ^version deck deps; version framework 0.1.0 (ADR 0051) ([ebf6b82](https://github.com/limond/liebstoeckel-app/commit/ebf6b82acda1f8f274cd3dd42b822a1b88968e68))
* **engine,plugins:** consistent control icons + mobile chrome overflow (ADR 0038) ([05ae897](https://github.com/limond/liebstoeckel-app/commit/05ae89720ef05cb11e1ba2fa518f3a8c7080cc90))
* **live:** audience write-scope enforcement for hosted sessions (ADR 0061, phase 1) ([c65e4ea](https://github.com/limond/liebstoeckel-app/commit/c65e4ea11ac1780e9542d5fabfb57e6ad36e132a))
* **mobile:** tap-to-interact plugin breakout on touch screens ([584174d](https://github.com/limond/liebstoeckel-app/commit/584174d26479ef02889664770b62cf0b6554cd79))
* **plugin-poll,plugin-qa:** presenter consoles ([dec07dd](https://github.com/limond/liebstoeckel-app/commit/dec07dddaf18bd43b3951e967fc1877962abbd8b))
* **plugin-qa:** ask from any slide via global chrome surfaces (ADR 0036) ([16e5938](https://github.com/limond/liebstoeckel-app/commit/16e593882a75c3d6bcb9948b3257566d4e29d05d))
* **plugin-sdk:** instance-keyed state + plugin index + surface fields ([aac6c2b](https://github.com/limond/liebstoeckel-app/commit/aac6c2bb610aa4fa65ec1d49c0a7a27990fe9163))
* **plugins:** audience Q&A + live reactions ([d7f0055](https://github.com/limond/liebstoeckel-app/commit/d7f00554d486bf20f7229044bb874813c1e29f8e))


### Bug Fixes

* **plugin-qa,engine:** presenter Q&A queue fills the panel; hide focus toggle on mobile ([16eaff2](https://github.com/limond/liebstoeckel-app/commit/16eaff2c67f54fc94774d088775dc055b31198db))
* **plugin-qa:** scroll the question queue so it can't overflow the slide ([28fd982](https://github.com/limond/liebstoeckel-app/commit/28fd982c9d70a07cc63edfea7695981829356f67))


### Code Refactoring

* rename present-it → liebstoeckel ([1c1dba6](https://github.com/limond/liebstoeckel-app/commit/1c1dba6e34502aff8df6bab2f1183ef40bc83a0b))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @liebstoeckel/plugin-sdk bumped to 0.2.0
    * @liebstoeckel/plugin-ui bumped to 0.2.0
