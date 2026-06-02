# Changelog

## [0.2.0](https://github.com/limond/liebstoeckel-app/compare/plugin-poll-v0.1.0...plugin-poll-v0.2.0) (2026-06-02)


### ⚠ BREAKING CHANGES

* npm scope, CLI binary, env vars and runtime globals renamed.

### Features

* **cli:** scaffold real ^version deck deps; version framework 0.1.0 (ADR 0051) ([ebf6b82](https://github.com/limond/liebstoeckel-app/commit/ebf6b82acda1f8f274cd3dd42b822a1b88968e68))
* **engine,plugins:** consistent control icons + mobile chrome overflow (ADR 0038) ([05ae897](https://github.com/limond/liebstoeckel-app/commit/05ae89720ef05cb11e1ba2fa518f3a8c7080cc90))
* **live:** audience write-scope enforcement for hosted sessions (ADR 0061, phase 1) ([c65e4ea](https://github.com/limond/liebstoeckel-app/commit/c65e4ea11ac1780e9542d5fabfb57e6ad36e132a))
* **live:** deck-free plugin-state decoder for persisted results (ADR 0061, phase 7-core) ([2dd664e](https://github.com/limond/liebstoeckel-app/commit/2dd664efd54a67539702f20815c7e05b04be11c5))
* **mobile:** tap-to-interact plugin breakout on touch screens ([584174d](https://github.com/limond/liebstoeckel-app/commit/584174d26479ef02889664770b62cf0b6554cd79))
* **plugin-poll,plugin-qa:** presenter consoles ([dec07dd](https://github.com/limond/liebstoeckel-app/commit/dec07dddaf18bd43b3951e967fc1877962abbd8b))
* **plugin-poll:** presenter.title so sibling poll instances are labelled by question ([ee9aa64](https://github.com/limond/liebstoeckel-app/commit/ee9aa642ba05df449d7fde166681e720fbd4fbc8))
* **thumbnails:** render plugin fallbacks in captured thumbnails ([d9f2df9](https://github.com/limond/liebstoeckel-app/commit/d9f2df9622700968c81fc20634c3feacfe7f20bb))


### Bug Fixes

* **presenter:** render previews live (crisp), raise thumbnail res to native 1280x720 ([29c7a42](https://github.com/limond/liebstoeckel-app/commit/29c7a42e75b2cbc77ee4101593d56738f65ab749))
* **thumbnails:** drop "offline / start the server" chrome in captures ([57d987b](https://github.com/limond/liebstoeckel-app/commit/57d987b1e50fa38aae3679dc1aba45b85611089c))


### Code Refactoring

* rename present-it → liebstoeckel ([1c1dba6](https://github.com/limond/liebstoeckel-app/commit/1c1dba6e34502aff8df6bab2f1183ef40bc83a0b))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @liebstoeckel/plugin-sdk bumped to 0.2.0
    * @liebstoeckel/plugin-ui bumped to 0.2.0
