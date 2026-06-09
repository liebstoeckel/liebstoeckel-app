# Changelog

## [0.3.3](https://github.com/limond/liebstoeckel-app/compare/plugin-sdk-v0.3.2...plugin-sdk-v0.3.3) (2026-06-09)


### Miscellaneous Chores

* **plugin-sdk:** Synchronize liebstoeckel versions

## [0.3.2](https://github.com/limond/liebstoeckel-app/compare/plugin-sdk-v0.3.1...plugin-sdk-v0.3.2) (2026-06-07)


### Miscellaneous Chores

* **plugin-sdk:** Synchronize liebstoeckel versions

## [0.3.1](https://github.com/limond/liebstoeckel-app/compare/plugin-sdk-v0.3.0...plugin-sdk-v0.3.1) (2026-06-07)


### ⚠ BREAKING CHANGES

* npm scope, CLI binary, env vars and runtime globals renamed.

### Features

* **cli:** scaffold real ^version deck deps; version framework 0.1.0 ((internal ADR)) ([ebf6b82](https://github.com/limond/liebstoeckel-app/commit/ebf6b82acda1f8f274cd3dd42b822a1b88968e68))
* **engine,plugin-sdk:** global panel sheet mode + visual-viewport pinning ((internal ADR)) ([a5da075](https://github.com/limond/liebstoeckel-app/commit/a5da0759b89758086745546703f94a7775dc5f6f))
* **engine,plugins:** consistent control icons + mobile chrome overflow ((internal ADR)) ([05ae897](https://github.com/limond/liebstoeckel-app/commit/05ae89720ef05cb11e1ba2fa518f3a8c7080cc90))
* **live:** audience write-scope enforcement for hosted sessions ((internal ADR), phase 1) ([c65e4ea](https://github.com/limond/liebstoeckel-app/commit/c65e4ea11ac1780e9542d5fabfb57e6ad36e132a))
* **live:** deck-free plugin-state decoder for persisted results ((internal ADR), phase 7-core) ([2dd664e](https://github.com/limond/liebstoeckel-app/commit/2dd664efd54a67539702f20815c7e05b04be11c5))
* **mobile:** tap-to-interact plugin breakout on touch screens ([584174d](https://github.com/limond/liebstoeckel-app/commit/584174d26479ef02889664770b62cf0b6554cd79))
* **plugin-sdk:** add the presenter console surface to the client contract ([ebc0ddf](https://github.com/limond/liebstoeckel-app/commit/ebc0ddf740f1622cca7041bb6d569c98ccf86e92))
* **plugin-sdk:** instance-keyed state + plugin index + surface fields ([aac6c2b](https://github.com/limond/liebstoeckel-app/commit/aac6c2bb610aa4fa65ec1d49c0a7a27990fe9163))
* **plugins:** deck-wide global plugin surfaces (overlay/control/panel) ([6068dcb](https://github.com/limond/liebstoeckel-app/commit/6068dcb757bafe56905a078f50eac5544ef81ef4))
* **relay:** hosted audience enforcement + snapshot persistence ((internal ADR), phase 7) ([ab1a54f](https://github.com/limond/liebstoeckel-app/commit/ab1a54f84184928935eef6c5823cb3a7e8907545))
* **thumbnails:** render plugin fallbacks in captured thumbnails ([d9f2df9](https://github.com/limond/liebstoeckel-app/commit/d9f2df9622700968c81fc20634c3feacfe7f20bb))


### Bug Fixes

* **build:** robust single-file output for &lt;/script&gt; and &lt;/body&gt; in JS strings ([8224fe6](https://github.com/limond/liebstoeckel-app/commit/8224fe695094466c25f8f90f7826ddaab3ec4f6d))
* **presenter:** render previews live (crisp), raise thumbnail res to native 1280x720 ([29c7a42](https://github.com/limond/liebstoeckel-app/commit/29c7a42e75b2cbc77ee4101593d56738f65ab749))
* **thumbnails:** drop "offline / start the server" chrome in captures ([57d987b](https://github.com/limond/liebstoeckel-app/commit/57d987b1e50fa38aae3679dc1aba45b85611089c))


### Miscellaneous Chores

* force release 0.3.1 (supersede broken 0.3.0 closure) ([87f1142](https://github.com/limond/liebstoeckel-app/commit/87f1142a44d814ab86f2112a2e9c8dcd705fb57c))


### Code Refactoring

* rename present-it → liebstoeckel ([1c1dba6](https://github.com/limond/liebstoeckel-app/commit/1c1dba6e34502aff8df6bab2f1183ef40bc83a0b))

## [0.3.0](https://github.com/limond/liebstoeckel-app/compare/plugin-sdk-v0.2.0...plugin-sdk-v0.3.0) (2026-06-07)


### Miscellaneous Chores

* **plugin-sdk:** Synchronize liebstoeckel versions

## [0.2.0](https://github.com/limond/liebstoeckel-app/compare/plugin-sdk-v0.1.0...plugin-sdk-v0.2.0) (2026-06-02)


### ⚠ BREAKING CHANGES

* npm scope, CLI binary, env vars and runtime globals renamed.

### Features

* **cli:** scaffold real ^version deck deps; version framework 0.1.0 ((internal ADR)) ([ebf6b82](https://github.com/limond/liebstoeckel-app/commit/ebf6b82acda1f8f274cd3dd42b822a1b88968e68))
* **engine,plugin-sdk:** global panel sheet mode + visual-viewport pinning ((internal ADR)) ([a5da075](https://github.com/limond/liebstoeckel-app/commit/a5da0759b89758086745546703f94a7775dc5f6f))
* **engine,plugins:** consistent control icons + mobile chrome overflow ((internal ADR)) ([05ae897](https://github.com/limond/liebstoeckel-app/commit/05ae89720ef05cb11e1ba2fa518f3a8c7080cc90))
* **live:** audience write-scope enforcement for hosted sessions ((internal ADR), phase 1) ([c65e4ea](https://github.com/limond/liebstoeckel-app/commit/c65e4ea11ac1780e9542d5fabfb57e6ad36e132a))
* **live:** deck-free plugin-state decoder for persisted results ((internal ADR), phase 7-core) ([2dd664e](https://github.com/limond/liebstoeckel-app/commit/2dd664efd54a67539702f20815c7e05b04be11c5))
* **mobile:** tap-to-interact plugin breakout on touch screens ([584174d](https://github.com/limond/liebstoeckel-app/commit/584174d26479ef02889664770b62cf0b6554cd79))
* **plugin-sdk:** add the presenter console surface to the client contract ([ebc0ddf](https://github.com/limond/liebstoeckel-app/commit/ebc0ddf740f1622cca7041bb6d569c98ccf86e92))
* **plugin-sdk:** instance-keyed state + plugin index + surface fields ([aac6c2b](https://github.com/limond/liebstoeckel-app/commit/aac6c2bb610aa4fa65ec1d49c0a7a27990fe9163))
* **plugins:** deck-wide global plugin surfaces (overlay/control/panel) ([6068dcb](https://github.com/limond/liebstoeckel-app/commit/6068dcb757bafe56905a078f50eac5544ef81ef4))
* **relay:** hosted audience enforcement + snapshot persistence ((internal ADR), phase 7) ([ab1a54f](https://github.com/limond/liebstoeckel-app/commit/ab1a54f84184928935eef6c5823cb3a7e8907545))
* **thumbnails:** render plugin fallbacks in captured thumbnails ([d9f2df9](https://github.com/limond/liebstoeckel-app/commit/d9f2df9622700968c81fc20634c3feacfe7f20bb))


### Bug Fixes

* **build:** robust single-file output for &lt;/script&gt; and &lt;/body&gt; in JS strings ([8224fe6](https://github.com/limond/liebstoeckel-app/commit/8224fe695094466c25f8f90f7826ddaab3ec4f6d))
* **presenter:** render previews live (crisp), raise thumbnail res to native 1280x720 ([29c7a42](https://github.com/limond/liebstoeckel-app/commit/29c7a42e75b2cbc77ee4101593d56738f65ab749))
* **thumbnails:** drop "offline / start the server" chrome in captures ([57d987b](https://github.com/limond/liebstoeckel-app/commit/57d987b1e50fa38aae3679dc1aba45b85611089c))


### Code Refactoring

* rename present-it → liebstoeckel ([1c1dba6](https://github.com/limond/liebstoeckel-app/commit/1c1dba6e34502aff8df6bab2f1183ef40bc83a0b))
