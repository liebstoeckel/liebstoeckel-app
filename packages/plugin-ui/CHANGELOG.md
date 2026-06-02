# Changelog

## [0.2.0](https://github.com/limond/liebstoeckel-app/compare/plugin-ui-v0.1.0...plugin-ui-v0.2.0) (2026-06-02)


### ⚠ BREAKING CHANGES

* npm scope, CLI binary, env vars and runtime globals renamed.

### Features

* **cli:** scaffold real ^version deck deps; version framework 0.1.0 (ADR 0051) ([ebf6b82](https://github.com/limond/liebstoeckel-app/commit/ebf6b82acda1f8f274cd3dd42b822a1b88968e68))
* **plugins:** deck-wide global plugin surfaces (overlay/control/panel) ([6068dcb](https://github.com/limond/liebstoeckel-app/commit/6068dcb757bafe56905a078f50eac5544ef81ef4))


### Bug Fixes

* **plugin-qa:** scroll the question queue so it can't overflow the slide ([28fd982](https://github.com/limond/liebstoeckel-app/commit/28fd982c9d70a07cc63edfea7695981829356f67))


### Code Refactoring

* rename present-it → liebstoeckel ([1c1dba6](https://github.com/limond/liebstoeckel-app/commit/1c1dba6e34502aff8df6bab2f1183ef40bc83a0b))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @liebstoeckel/plugin-sdk bumped to 0.2.0
