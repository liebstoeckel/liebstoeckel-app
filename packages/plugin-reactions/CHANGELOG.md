# Changelog

## [0.2.0](https://github.com/limond/liebstoeckel-app/compare/plugin-reactions-v0.1.0...plugin-reactions-v0.2.0) (2026-06-02)


### ⚠ BREAKING CHANGES

* npm scope, CLI binary, env vars and runtime globals renamed.

### Features

* **cli:** scaffold real ^version deck deps; version framework 0.1.0 (ADR 0051) ([ebf6b82](https://github.com/limond/liebstoeckel-app/commit/ebf6b82acda1f8f274cd3dd42b822a1b88968e68))
* **engine,plugins:** consistent control icons + mobile chrome overflow (ADR 0038) ([05ae897](https://github.com/limond/liebstoeckel-app/commit/05ae89720ef05cb11e1ba2fa518f3a8c7080cc90))
* **live:** audience write-scope enforcement for hosted sessions (ADR 0061, phase 1) ([c65e4ea](https://github.com/limond/liebstoeckel-app/commit/c65e4ea11ac1780e9542d5fabfb57e6ad36e132a))
* **mobile:** tap-to-interact plugin breakout on touch screens ([584174d](https://github.com/limond/liebstoeckel-app/commit/584174d26479ef02889664770b62cf0b6554cd79))
* **plugin-sdk:** instance-keyed state + plugin index + surface fields ([aac6c2b](https://github.com/limond/liebstoeckel-app/commit/aac6c2bb610aa4fa65ec1d49c0a7a27990fe9163))
* **plugins:** audience Q&A + live reactions ([d7f0055](https://github.com/limond/liebstoeckel-app/commit/d7f00554d486bf20f7229044bb874813c1e29f8e))
* **plugins:** deck-wide global plugin surfaces (overlay/control/panel) ([6068dcb](https://github.com/limond/liebstoeckel-app/commit/6068dcb757bafe56905a078f50eac5544ef81ef4))


### Bug Fixes

* **reactions:** linger longer + open in a non-blurring popover ([94ce202](https://github.com/limond/liebstoeckel-app/commit/94ce202ff302b67bcd5a04656e525c2f6c3d1ef2))


### Code Refactoring

* rename present-it → liebstoeckel ([1c1dba6](https://github.com/limond/liebstoeckel-app/commit/1c1dba6e34502aff8df6bab2f1183ef40bc83a0b))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @liebstoeckel/plugin-sdk bumped to 0.2.0
    * @liebstoeckel/plugin-ui bumped to 0.2.0
