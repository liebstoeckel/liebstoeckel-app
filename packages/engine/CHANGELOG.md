# Changelog

## [0.3.4](https://github.com/liebstoeckel/liebstoeckel-app/compare/engine-v0.3.3...engine-v0.3.4) (2026-06-13)


### Features

* **engine,cli:** embed bundle-time third-party license notices in every deck ([c165bf2](https://github.com/liebstoeckel/liebstoeckel-app/commit/c165bf284168b19a34779a79a4dd59656de55429))


### Bug Fixes

* **engine:** collect licenses via onLoad only, never onResolve ([a2e0a6f](https://github.com/liebstoeckel/liebstoeckel-app/commit/a2e0a6f7a846ed6f0663e8b56cde149bbcdfd688))

## [0.3.3](https://github.com/liebstoeckel/liebstoeckel-app/compare/engine-v0.3.2...engine-v0.3.3) (2026-06-09)


### Miscellaneous Chores

* **engine:** Synchronize liebstoeckel versions


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @liebstoeckel/components bumped to 0.3.3
    * @liebstoeckel/plugin-sdk bumped to 0.3.3
    * @liebstoeckel/plugin-ui bumped to 0.3.3
    * @liebstoeckel/theme bumped to 0.3.3

## [0.3.2](https://github.com/liebstoeckel/liebstoeckel-app/compare/engine-v0.3.1...engine-v0.3.2) (2026-06-07)


### ⚠ BREAKING CHANGES

* npm scope, CLI binary, env vars and runtime globals renamed.

### Features

* **agent:** agent-readable CLI/registry + liebstoeckel-deck skill ((internal ADR)/0045) ([a760569](https://github.com/liebstoeckel/liebstoeckel-app/commit/a760569749e40cbc85a96c5d187e375221cabb01))
* **cli:** scaffold real ^version deck deps; version framework 0.1.0 ((internal ADR)) ([ebf6b82](https://github.com/liebstoeckel/liebstoeckel-app/commit/ebf6b82acda1f8f274cd3dd42b822a1b88968e68))
* **code:** build-time Shiki highlighting + animated CodeMagic ([90a4b56](https://github.com/liebstoeckel/liebstoeckel-app/commit/90a4b56d39b0640caaec9bfb7799e600d958a0f3))
* **deck:** build output as &lt;slug&gt;.html + server-side title precedence ((internal ADR)) ([968ec51](https://github.com/liebstoeckel/liebstoeckel-app/commit/968ec513e017002fbeef03c76d72c3961156c406))
* **engine,cli:** inline source package — compiled decks are ejectable ((internal ADR)) ([370fba0](https://github.com/liebstoeckel/liebstoeckel-app/commit/370fba0078b77c7dc8122c2d3e8045ebedfc888a))
* **engine,plugin-sdk:** global panel sheet mode + visual-viewport pinning ((internal ADR)) ([a5da075](https://github.com/liebstoeckel/liebstoeckel-app/commit/a5da0759b89758086745546703f94a7775dc5f6f))
* **engine,plugins:** consistent control icons + mobile chrome overflow ((internal ADR)) ([05ae897](https://github.com/liebstoeckel/liebstoeckel-app/commit/05ae89720ef05cb11e1ba2fa518f3a8c7080cc90))
* **engine:** brandThemes — decks define their own brand; t-cycle desktop-only ([b6401b5](https://github.com/liebstoeckel/liebstoeckel-app/commit/b6401b55246e0481da6bab27e2e3ca778e2cb075))
* **engine:** configurable slide transitions + mobile escape hatch ([9b551ce](https://github.com/liebstoeckel/liebstoeckel-app/commit/9b551ce06658da8aeaec158e280bb641ccc8f24a))
* **engine:** mobile presenter view — notes-first confidence monitor + ⋮ entry ((internal ADR)) ([4d4cc97](https://github.com/liebstoeckel/liebstoeckel-app/commit/4d4cc9777c16e364278dffe5209162a085ee14f6))
* **engine:** mobile-friendly deck chrome — device-scale rail, dvh, ⋮ menu ([38c911e](https://github.com/liebstoeckel/liebstoeckel-app/commit/38c911e69b5d29470700c7aabbfc3199452fdf64))
* **engine:** Plugin instance prop + instance-aware presenter console ([5b4c5d3](https://github.com/liebstoeckel/liebstoeckel-app/commit/5b4c5d3e56d5b155f137b4b68fb82b86ec6a9284))
* **engine:** presenter console — one tab per type + instance dropdown ((internal ADR)) ([d63afdf](https://github.com/liebstoeckel/liebstoeckel-app/commit/d63afdfdd01b8d96a36efc44ca162342ca6574c6))
* **engine:** presenter console panel + focus mode ([3f5e9c9](https://github.com/liebstoeckel/liebstoeckel-app/commit/3f5e9c9ee84ff6261e747e27e6a5837f978d3460))
* **engine:** presenter view shares both QRs (follow-along + drive-from-phone) on Q ([ef1cdcc](https://github.com/liebstoeckel/liebstoeckel-app/commit/ef1cdcc4ea723beb7a9236eb3f91ea2d7bfa4316))
* **engine:** shared presenter timer via the doc ((internal ADR)) ([8943597](https://github.com/liebstoeckel/liebstoeckel-app/commit/8943597f58b23c29e9c735000c02ee760118bfac))
* **export:** PNG/PDF slide export — single slide, range, or whole deck ([430a687](https://github.com/liebstoeckel/liebstoeckel-app/commit/430a687704ba94910317e7d15ec78142f199903d))
* **featureset-3:** build-time thumbnails + secure public relay ([dd3feba](https://github.com/liebstoeckel/liebstoeckel-app/commit/dd3febadd8641f64657d5298b29ea5242f34bc64))
* **live:** audience write-scope enforcement for hosted sessions ((internal ADR), phase 1) ([c65e4ea](https://github.com/liebstoeckel/liebstoeckel-app/commit/c65e4ea11ac1780e9542d5fabfb57e6ad36e132a))
* **live:** recovery primitives — crash detection + reconnect escalation ((internal ticket)) ([ec86815](https://github.com/liebstoeckel/liebstoeckel-app/commit/ec8681564c361853006e9d1514c605caf051e64d))
* **mobile:** tap-to-interact plugin breakout on touch screens ([584174d](https://github.com/liebstoeckel/liebstoeckel-app/commit/584174d26479ef02889664770b62cf0b6554cd79))
* **mobile:** touch navigation, portrait hint, responsive presenter ([4bd616c](https://github.com/liebstoeckel/liebstoeckel-app/commit/4bd616ce33b629439958643d80d0c61bb9f93fd0))
* **plugin-qa:** ask from any slide via global chrome surfaces ((internal ADR)) ([16e5938](https://github.com/liebstoeckel/liebstoeckel-app/commit/16e593882a75c3d6bcb9948b3257566d4e29d05d))
* **plugins:** deck-wide global plugin surfaces (overlay/control/panel) ([6068dcb](https://github.com/liebstoeckel/liebstoeckel-app/commit/6068dcb757bafe56905a078f50eac5544ef81ef4))
* **presenter:** prominent step/reveal indicator ([f8e7f6c](https://github.com/liebstoeckel/liebstoeckel-app/commit/f8e7f6c3a6137e419564d7967ac4ce88fb783c5c))
* **registry:** shadcn-style component registry + visx chart gallery ([00fd894](https://github.com/liebstoeckel/liebstoeckel-app/commit/00fd8944f888a990afe6d4dfef5463478d6324cd))
* **relay:** enable the presenter pop-out (P) — sandbox allow-popups ([d6f2c70](https://github.com/liebstoeckel/liebstoeckel-app/commit/d6f2c70e0192aa3fd5b93a5749ae6ba6f9a17fa5))
* **theme:** liebstoeckel "Noir" house brand + Schibsted font ([c8549b6](https://github.com/liebstoeckel/liebstoeckel-app/commit/c8549b64f18d12a811983188cc598e2e09b1f51b))
* **thumbnails:** render plugin fallbacks in captured thumbnails ([d9f2df9](https://github.com/liebstoeckel/liebstoeckel-app/commit/d9f2df9622700968c81fc20634c3feacfe7f20bb))


### Bug Fixes

* **build:** robust single-file output for &lt;/script&gt; and &lt;/body&gt; in JS strings ([8224fe6](https://github.com/liebstoeckel/liebstoeckel-app/commit/8224fe695094466c25f8f90f7826ddaab3ec4f6d))
* **deps:** keep exact workspace pins for cross-deps (revert caret) ([6526a68](https://github.com/liebstoeckel/liebstoeckel-app/commit/6526a68b799a724bfbe6e9467e79d531c9227cb5))
* **deps:** use caret ranges for workspace cross-deps ([3675d30](https://github.com/liebstoeckel/liebstoeckel-app/commit/3675d30829a97ffcf9a47c4e8d9f9f505d86b4a4))
* **engine:** don't fire global deck shortcuts while typing in a plugin input ([230b488](https://github.com/liebstoeckel/liebstoeckel-app/commit/230b48818ee6006731501128d2785e6276bd8c00))
* **engine:** gate presenter view + presenter-only shortcuts on live role ((internal ADR)) ([e6844d9](https://github.com/liebstoeckel/liebstoeckel-app/commit/e6844d9de020420c10b7acc3d9b0179a335a3c5a))
* **engine:** gray out presenter Next at deck end (and Prev at start) ([0e85d04](https://github.com/liebstoeckel/liebstoeckel-app/commit/0e85d04257b48c06ac0ddd331f45cfacaf78e4b4))
* **engine:** isolate each plugin surface's Motion layout so a panel can't steal the slide's rows ([76708a0](https://github.com/liebstoeckel/liebstoeckel-app/commit/76708a0b19e6319e9736131ccea550f7e37e1949))
* **engine:** Motion-track the ScaledStage transform so layoutId morphs are scale-correct ([a154fbd](https://github.com/liebstoeckel/liebstoeckel-app/commit/a154fbdee286ad56c998d7006cca254b40b7ffe5))
* **engine:** persistent element — scale-correct, fades with transition, travel vs snap ([65a825c](https://github.com/liebstoeckel/liebstoeckel-app/commit/65a825ca477e913c9f3e83685ed9b1f93a4c97c0))
* **engine:** position persistent slot elements correctly when the stage is scaled ([f85a3ea](https://github.com/liebstoeckel/liebstoeckel-app/commit/f85a3eaafc5a2334c092a9fa8f603e57ff30f197))
* **engine:** presenter next-slide preview is pointer-inert ((internal ADR)) ([2b4387f](https://github.com/liebstoeckel/liebstoeckel-app/commit/2b4387fabeaaa41f1b7560c3efab30e2f6a660f0))
* **engine:** QR overlays dismiss consistently — Esc everywhere + a ✕ on the share ([405d983](https://github.com/liebstoeckel/liebstoeckel-app/commit/405d983bcb66f375c7cd22ee45e3246be83fec7a))
* **engine:** size the presenter "Next up" preview so it fills its box ([da39584](https://github.com/liebstoeckel/liebstoeckel-app/commit/da3958421cf60f455cf35d24298edb97828054d7))
* **live:** guard relay broadcast + half-open detection (keepalive + watchdog) ([6c2db23](https://github.com/liebstoeckel/liebstoeckel-app/commit/6c2db234e659c670968f62ead897133af061bf5c))
* **plugin-qa,engine:** presenter Q&A queue fills the panel; hide focus toggle on mobile ([16eaff2](https://github.com/liebstoeckel/liebstoeckel-app/commit/16eaff2c67f54fc94774d088775dc055b31198db))
* **presenter:** render previews live (crisp), raise thumbnail res to native 1280x720 ([29c7a42](https://github.com/liebstoeckel/liebstoeckel-app/commit/29c7a42e75b2cbc77ee4101593d56738f65ab749))
* **reactions:** linger longer + open in a non-blurring popover ([94ce202](https://github.com/liebstoeckel/liebstoeckel-app/commit/94ce202ff302b67bcd5a04656e525c2f6c3d1ef2))
* **thumbnails:** drop "offline / start the server" chrome in captures ([57d987b](https://github.com/liebstoeckel/liebstoeckel-app/commit/57d987b1e50fa38aae3679dc1aba45b85611089c))


### Miscellaneous Chores

* force release 0.3.1 (supersede broken 0.3.0 closure) ([87f1142](https://github.com/liebstoeckel/liebstoeckel-app/commit/87f1142a44d814ab86f2112a2e9c8dcd705fb57c))


### Code Refactoring

* rename present-it → liebstoeckel ([1c1dba6](https://github.com/liebstoeckel/liebstoeckel-app/commit/1c1dba6e34502aff8df6bab2f1183ef40bc83a0b))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @liebstoeckel/components bumped to 0.3.2
    * @liebstoeckel/plugin-sdk bumped to 0.3.2
    * @liebstoeckel/plugin-ui bumped to 0.3.2
    * @liebstoeckel/theme bumped to 0.3.2

## [0.3.1](https://github.com/liebstoeckel/liebstoeckel-app/compare/engine-v0.3.0...engine-v0.3.1) (2026-06-07)


### ⚠ BREAKING CHANGES

* npm scope, CLI binary, env vars and runtime globals renamed.

### Features

* **agent:** agent-readable CLI/registry + liebstoeckel-deck skill ((internal ADR)/0045) ([a760569](https://github.com/liebstoeckel/liebstoeckel-app/commit/a760569749e40cbc85a96c5d187e375221cabb01))
* **cli:** scaffold real ^version deck deps; version framework 0.1.0 ((internal ADR)) ([ebf6b82](https://github.com/liebstoeckel/liebstoeckel-app/commit/ebf6b82acda1f8f274cd3dd42b822a1b88968e68))
* **code:** build-time Shiki highlighting + animated CodeMagic ([90a4b56](https://github.com/liebstoeckel/liebstoeckel-app/commit/90a4b56d39b0640caaec9bfb7799e600d958a0f3))
* **deck:** build output as &lt;slug&gt;.html + server-side title precedence ((internal ADR)) ([968ec51](https://github.com/liebstoeckel/liebstoeckel-app/commit/968ec513e017002fbeef03c76d72c3961156c406))
* **engine,cli:** inline source package — compiled decks are ejectable ((internal ADR)) ([370fba0](https://github.com/liebstoeckel/liebstoeckel-app/commit/370fba0078b77c7dc8122c2d3e8045ebedfc888a))
* **engine,plugin-sdk:** global panel sheet mode + visual-viewport pinning ((internal ADR)) ([a5da075](https://github.com/liebstoeckel/liebstoeckel-app/commit/a5da0759b89758086745546703f94a7775dc5f6f))
* **engine,plugins:** consistent control icons + mobile chrome overflow ((internal ADR)) ([05ae897](https://github.com/liebstoeckel/liebstoeckel-app/commit/05ae89720ef05cb11e1ba2fa518f3a8c7080cc90))
* **engine:** brandThemes — decks define their own brand; t-cycle desktop-only ([b6401b5](https://github.com/liebstoeckel/liebstoeckel-app/commit/b6401b55246e0481da6bab27e2e3ca778e2cb075))
* **engine:** configurable slide transitions + mobile escape hatch ([9b551ce](https://github.com/liebstoeckel/liebstoeckel-app/commit/9b551ce06658da8aeaec158e280bb641ccc8f24a))
* **engine:** mobile presenter view — notes-first confidence monitor + ⋮ entry ((internal ADR)) ([4d4cc97](https://github.com/liebstoeckel/liebstoeckel-app/commit/4d4cc9777c16e364278dffe5209162a085ee14f6))
* **engine:** mobile-friendly deck chrome — device-scale rail, dvh, ⋮ menu ([38c911e](https://github.com/liebstoeckel/liebstoeckel-app/commit/38c911e69b5d29470700c7aabbfc3199452fdf64))
* **engine:** Plugin instance prop + instance-aware presenter console ([5b4c5d3](https://github.com/liebstoeckel/liebstoeckel-app/commit/5b4c5d3e56d5b155f137b4b68fb82b86ec6a9284))
* **engine:** presenter console — one tab per type + instance dropdown ((internal ADR)) ([d63afdf](https://github.com/liebstoeckel/liebstoeckel-app/commit/d63afdfdd01b8d96a36efc44ca162342ca6574c6))
* **engine:** presenter console panel + focus mode ([3f5e9c9](https://github.com/liebstoeckel/liebstoeckel-app/commit/3f5e9c9ee84ff6261e747e27e6a5837f978d3460))
* **engine:** presenter view shares both QRs (follow-along + drive-from-phone) on Q ([ef1cdcc](https://github.com/liebstoeckel/liebstoeckel-app/commit/ef1cdcc4ea723beb7a9236eb3f91ea2d7bfa4316))
* **engine:** shared presenter timer via the doc ((internal ADR)) ([8943597](https://github.com/liebstoeckel/liebstoeckel-app/commit/8943597f58b23c29e9c735000c02ee760118bfac))
* **export:** PNG/PDF slide export — single slide, range, or whole deck ([430a687](https://github.com/liebstoeckel/liebstoeckel-app/commit/430a687704ba94910317e7d15ec78142f199903d))
* **featureset-3:** build-time thumbnails + secure public relay ([dd3feba](https://github.com/liebstoeckel/liebstoeckel-app/commit/dd3febadd8641f64657d5298b29ea5242f34bc64))
* **live:** audience write-scope enforcement for hosted sessions ((internal ADR), phase 1) ([c65e4ea](https://github.com/liebstoeckel/liebstoeckel-app/commit/c65e4ea11ac1780e9542d5fabfb57e6ad36e132a))
* **live:** recovery primitives — crash detection + reconnect escalation ((internal ticket)) ([ec86815](https://github.com/liebstoeckel/liebstoeckel-app/commit/ec8681564c361853006e9d1514c605caf051e64d))
* **mobile:** tap-to-interact plugin breakout on touch screens ([584174d](https://github.com/liebstoeckel/liebstoeckel-app/commit/584174d26479ef02889664770b62cf0b6554cd79))
* **mobile:** touch navigation, portrait hint, responsive presenter ([4bd616c](https://github.com/liebstoeckel/liebstoeckel-app/commit/4bd616ce33b629439958643d80d0c61bb9f93fd0))
* **plugin-qa:** ask from any slide via global chrome surfaces ((internal ADR)) ([16e5938](https://github.com/liebstoeckel/liebstoeckel-app/commit/16e593882a75c3d6bcb9948b3257566d4e29d05d))
* **plugins:** deck-wide global plugin surfaces (overlay/control/panel) ([6068dcb](https://github.com/liebstoeckel/liebstoeckel-app/commit/6068dcb757bafe56905a078f50eac5544ef81ef4))
* **presenter:** prominent step/reveal indicator ([f8e7f6c](https://github.com/liebstoeckel/liebstoeckel-app/commit/f8e7f6c3a6137e419564d7967ac4ce88fb783c5c))
* **registry:** shadcn-style component registry + visx chart gallery ([00fd894](https://github.com/liebstoeckel/liebstoeckel-app/commit/00fd8944f888a990afe6d4dfef5463478d6324cd))
* **relay:** enable the presenter pop-out (P) — sandbox allow-popups ([d6f2c70](https://github.com/liebstoeckel/liebstoeckel-app/commit/d6f2c70e0192aa3fd5b93a5749ae6ba6f9a17fa5))
* **theme:** liebstoeckel "Noir" house brand + Schibsted font ([c8549b6](https://github.com/liebstoeckel/liebstoeckel-app/commit/c8549b64f18d12a811983188cc598e2e09b1f51b))
* **thumbnails:** render plugin fallbacks in captured thumbnails ([d9f2df9](https://github.com/liebstoeckel/liebstoeckel-app/commit/d9f2df9622700968c81fc20634c3feacfe7f20bb))


### Bug Fixes

* **build:** robust single-file output for &lt;/script&gt; and &lt;/body&gt; in JS strings ([8224fe6](https://github.com/liebstoeckel/liebstoeckel-app/commit/8224fe695094466c25f8f90f7826ddaab3ec4f6d))
* **deps:** keep exact workspace pins for cross-deps (revert caret) ([6526a68](https://github.com/liebstoeckel/liebstoeckel-app/commit/6526a68b799a724bfbe6e9467e79d531c9227cb5))
* **deps:** use caret ranges for workspace cross-deps ([3675d30](https://github.com/liebstoeckel/liebstoeckel-app/commit/3675d30829a97ffcf9a47c4e8d9f9f505d86b4a4))
* **engine:** don't fire global deck shortcuts while typing in a plugin input ([230b488](https://github.com/liebstoeckel/liebstoeckel-app/commit/230b48818ee6006731501128d2785e6276bd8c00))
* **engine:** gate presenter view + presenter-only shortcuts on live role ((internal ADR)) ([e6844d9](https://github.com/liebstoeckel/liebstoeckel-app/commit/e6844d9de020420c10b7acc3d9b0179a335a3c5a))
* **engine:** gray out presenter Next at deck end (and Prev at start) ([0e85d04](https://github.com/liebstoeckel/liebstoeckel-app/commit/0e85d04257b48c06ac0ddd331f45cfacaf78e4b4))
* **engine:** isolate each plugin surface's Motion layout so a panel can't steal the slide's rows ([76708a0](https://github.com/liebstoeckel/liebstoeckel-app/commit/76708a0b19e6319e9736131ccea550f7e37e1949))
* **engine:** Motion-track the ScaledStage transform so layoutId morphs are scale-correct ([a154fbd](https://github.com/liebstoeckel/liebstoeckel-app/commit/a154fbdee286ad56c998d7006cca254b40b7ffe5))
* **engine:** persistent element — scale-correct, fades with transition, travel vs snap ([65a825c](https://github.com/liebstoeckel/liebstoeckel-app/commit/65a825ca477e913c9f3e83685ed9b1f93a4c97c0))
* **engine:** position persistent slot elements correctly when the stage is scaled ([f85a3ea](https://github.com/liebstoeckel/liebstoeckel-app/commit/f85a3eaafc5a2334c092a9fa8f603e57ff30f197))
* **engine:** presenter next-slide preview is pointer-inert ((internal ADR)) ([2b4387f](https://github.com/liebstoeckel/liebstoeckel-app/commit/2b4387fabeaaa41f1b7560c3efab30e2f6a660f0))
* **engine:** QR overlays dismiss consistently — Esc everywhere + a ✕ on the share ([405d983](https://github.com/liebstoeckel/liebstoeckel-app/commit/405d983bcb66f375c7cd22ee45e3246be83fec7a))
* **engine:** size the presenter "Next up" preview so it fills its box ([da39584](https://github.com/liebstoeckel/liebstoeckel-app/commit/da3958421cf60f455cf35d24298edb97828054d7))
* **live:** guard relay broadcast + half-open detection (keepalive + watchdog) ([6c2db23](https://github.com/liebstoeckel/liebstoeckel-app/commit/6c2db234e659c670968f62ead897133af061bf5c))
* **plugin-qa,engine:** presenter Q&A queue fills the panel; hide focus toggle on mobile ([16eaff2](https://github.com/liebstoeckel/liebstoeckel-app/commit/16eaff2c67f54fc94774d088775dc055b31198db))
* **presenter:** render previews live (crisp), raise thumbnail res to native 1280x720 ([29c7a42](https://github.com/liebstoeckel/liebstoeckel-app/commit/29c7a42e75b2cbc77ee4101593d56738f65ab749))
* **reactions:** linger longer + open in a non-blurring popover ([94ce202](https://github.com/liebstoeckel/liebstoeckel-app/commit/94ce202ff302b67bcd5a04656e525c2f6c3d1ef2))
* **thumbnails:** drop "offline / start the server" chrome in captures ([57d987b](https://github.com/liebstoeckel/liebstoeckel-app/commit/57d987b1e50fa38aae3679dc1aba45b85611089c))


### Miscellaneous Chores

* force release 0.3.1 (supersede broken 0.3.0 closure) ([87f1142](https://github.com/liebstoeckel/liebstoeckel-app/commit/87f1142a44d814ab86f2112a2e9c8dcd705fb57c))


### Code Refactoring

* rename present-it → liebstoeckel ([1c1dba6](https://github.com/liebstoeckel/liebstoeckel-app/commit/1c1dba6e34502aff8df6bab2f1183ef40bc83a0b))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @liebstoeckel/components bumped to 0.3.1
    * @liebstoeckel/plugin-sdk bumped to 0.3.1
    * @liebstoeckel/plugin-ui bumped to 0.3.1
    * @liebstoeckel/theme bumped to 0.3.1

## [0.3.0](https://github.com/liebstoeckel/liebstoeckel-app/compare/engine-v0.2.1...engine-v0.3.0) (2026-06-07)


### ⚠ BREAKING CHANGES

* npm scope, CLI binary, env vars and runtime globals renamed.

### Features

* **agent:** agent-readable CLI/registry + liebstoeckel-deck skill ((internal ADR)/0045) ([a760569](https://github.com/liebstoeckel/liebstoeckel-app/commit/a760569749e40cbc85a96c5d187e375221cabb01))
* **cli:** scaffold real ^version deck deps; version framework 0.1.0 ((internal ADR)) ([ebf6b82](https://github.com/liebstoeckel/liebstoeckel-app/commit/ebf6b82acda1f8f274cd3dd42b822a1b88968e68))
* **code:** build-time Shiki highlighting + animated CodeMagic ([90a4b56](https://github.com/liebstoeckel/liebstoeckel-app/commit/90a4b56d39b0640caaec9bfb7799e600d958a0f3))
* **deck:** build output as &lt;slug&gt;.html + server-side title precedence ((internal ADR)) ([968ec51](https://github.com/liebstoeckel/liebstoeckel-app/commit/968ec513e017002fbeef03c76d72c3961156c406))
* **engine,cli:** inline source package — compiled decks are ejectable ((internal ADR)) ([370fba0](https://github.com/liebstoeckel/liebstoeckel-app/commit/370fba0078b77c7dc8122c2d3e8045ebedfc888a))
* **engine,plugin-sdk:** global panel sheet mode + visual-viewport pinning ((internal ADR)) ([a5da075](https://github.com/liebstoeckel/liebstoeckel-app/commit/a5da0759b89758086745546703f94a7775dc5f6f))
* **engine,plugins:** consistent control icons + mobile chrome overflow ((internal ADR)) ([05ae897](https://github.com/liebstoeckel/liebstoeckel-app/commit/05ae89720ef05cb11e1ba2fa518f3a8c7080cc90))
* **engine:** brandThemes — decks define their own brand; t-cycle desktop-only ([b6401b5](https://github.com/liebstoeckel/liebstoeckel-app/commit/b6401b55246e0481da6bab27e2e3ca778e2cb075))
* **engine:** configurable slide transitions + mobile escape hatch ([9b551ce](https://github.com/liebstoeckel/liebstoeckel-app/commit/9b551ce06658da8aeaec158e280bb641ccc8f24a))
* **engine:** mobile presenter view — notes-first confidence monitor + ⋮ entry ((internal ADR)) ([4d4cc97](https://github.com/liebstoeckel/liebstoeckel-app/commit/4d4cc9777c16e364278dffe5209162a085ee14f6))
* **engine:** mobile-friendly deck chrome — device-scale rail, dvh, ⋮ menu ([38c911e](https://github.com/liebstoeckel/liebstoeckel-app/commit/38c911e69b5d29470700c7aabbfc3199452fdf64))
* **engine:** Plugin instance prop + instance-aware presenter console ([5b4c5d3](https://github.com/liebstoeckel/liebstoeckel-app/commit/5b4c5d3e56d5b155f137b4b68fb82b86ec6a9284))
* **engine:** presenter console — one tab per type + instance dropdown ((internal ADR)) ([d63afdf](https://github.com/liebstoeckel/liebstoeckel-app/commit/d63afdfdd01b8d96a36efc44ca162342ca6574c6))
* **engine:** presenter console panel + focus mode ([3f5e9c9](https://github.com/liebstoeckel/liebstoeckel-app/commit/3f5e9c9ee84ff6261e747e27e6a5837f978d3460))
* **engine:** presenter view shares both QRs (follow-along + drive-from-phone) on Q ([ef1cdcc](https://github.com/liebstoeckel/liebstoeckel-app/commit/ef1cdcc4ea723beb7a9236eb3f91ea2d7bfa4316))
* **engine:** shared presenter timer via the doc ((internal ADR)) ([8943597](https://github.com/liebstoeckel/liebstoeckel-app/commit/8943597f58b23c29e9c735000c02ee760118bfac))
* **export:** PNG/PDF slide export — single slide, range, or whole deck ([430a687](https://github.com/liebstoeckel/liebstoeckel-app/commit/430a687704ba94910317e7d15ec78142f199903d))
* **featureset-3:** build-time thumbnails + secure public relay ([dd3feba](https://github.com/liebstoeckel/liebstoeckel-app/commit/dd3febadd8641f64657d5298b29ea5242f34bc64))
* **live:** audience write-scope enforcement for hosted sessions ((internal ADR), phase 1) ([c65e4ea](https://github.com/liebstoeckel/liebstoeckel-app/commit/c65e4ea11ac1780e9542d5fabfb57e6ad36e132a))
* **live:** recovery primitives — crash detection + reconnect escalation ((internal ticket)) ([ec86815](https://github.com/liebstoeckel/liebstoeckel-app/commit/ec8681564c361853006e9d1514c605caf051e64d))
* **mobile:** tap-to-interact plugin breakout on touch screens ([584174d](https://github.com/liebstoeckel/liebstoeckel-app/commit/584174d26479ef02889664770b62cf0b6554cd79))
* **mobile:** touch navigation, portrait hint, responsive presenter ([4bd616c](https://github.com/liebstoeckel/liebstoeckel-app/commit/4bd616ce33b629439958643d80d0c61bb9f93fd0))
* **plugin-qa:** ask from any slide via global chrome surfaces ((internal ADR)) ([16e5938](https://github.com/liebstoeckel/liebstoeckel-app/commit/16e593882a75c3d6bcb9948b3257566d4e29d05d))
* **plugins:** deck-wide global plugin surfaces (overlay/control/panel) ([6068dcb](https://github.com/liebstoeckel/liebstoeckel-app/commit/6068dcb757bafe56905a078f50eac5544ef81ef4))
* **presenter:** prominent step/reveal indicator ([f8e7f6c](https://github.com/liebstoeckel/liebstoeckel-app/commit/f8e7f6c3a6137e419564d7967ac4ce88fb783c5c))
* **registry:** shadcn-style component registry + visx chart gallery ([00fd894](https://github.com/liebstoeckel/liebstoeckel-app/commit/00fd8944f888a990afe6d4dfef5463478d6324cd))
* **relay:** enable the presenter pop-out (P) — sandbox allow-popups ([d6f2c70](https://github.com/liebstoeckel/liebstoeckel-app/commit/d6f2c70e0192aa3fd5b93a5749ae6ba6f9a17fa5))
* **theme:** liebstoeckel "Noir" house brand + Schibsted font ([c8549b6](https://github.com/liebstoeckel/liebstoeckel-app/commit/c8549b64f18d12a811983188cc598e2e09b1f51b))
* **thumbnails:** render plugin fallbacks in captured thumbnails ([d9f2df9](https://github.com/liebstoeckel/liebstoeckel-app/commit/d9f2df9622700968c81fc20634c3feacfe7f20bb))


### Bug Fixes

* **build:** robust single-file output for &lt;/script&gt; and &lt;/body&gt; in JS strings ([8224fe6](https://github.com/liebstoeckel/liebstoeckel-app/commit/8224fe695094466c25f8f90f7826ddaab3ec4f6d))
* **deps:** keep exact workspace pins for cross-deps (revert caret) ([6526a68](https://github.com/liebstoeckel/liebstoeckel-app/commit/6526a68b799a724bfbe6e9467e79d531c9227cb5))
* **deps:** use caret ranges for workspace cross-deps ([3675d30](https://github.com/liebstoeckel/liebstoeckel-app/commit/3675d30829a97ffcf9a47c4e8d9f9f505d86b4a4))
* **engine:** don't fire global deck shortcuts while typing in a plugin input ([230b488](https://github.com/liebstoeckel/liebstoeckel-app/commit/230b48818ee6006731501128d2785e6276bd8c00))
* **engine:** gate presenter view + presenter-only shortcuts on live role ((internal ADR)) ([e6844d9](https://github.com/liebstoeckel/liebstoeckel-app/commit/e6844d9de020420c10b7acc3d9b0179a335a3c5a))
* **engine:** gray out presenter Next at deck end (and Prev at start) ([0e85d04](https://github.com/liebstoeckel/liebstoeckel-app/commit/0e85d04257b48c06ac0ddd331f45cfacaf78e4b4))
* **engine:** isolate each plugin surface's Motion layout so a panel can't steal the slide's rows ([76708a0](https://github.com/liebstoeckel/liebstoeckel-app/commit/76708a0b19e6319e9736131ccea550f7e37e1949))
* **engine:** Motion-track the ScaledStage transform so layoutId morphs are scale-correct ([a154fbd](https://github.com/liebstoeckel/liebstoeckel-app/commit/a154fbdee286ad56c998d7006cca254b40b7ffe5))
* **engine:** persistent element — scale-correct, fades with transition, travel vs snap ([65a825c](https://github.com/liebstoeckel/liebstoeckel-app/commit/65a825ca477e913c9f3e83685ed9b1f93a4c97c0))
* **engine:** position persistent slot elements correctly when the stage is scaled ([f85a3ea](https://github.com/liebstoeckel/liebstoeckel-app/commit/f85a3eaafc5a2334c092a9fa8f603e57ff30f197))
* **engine:** presenter next-slide preview is pointer-inert ((internal ADR)) ([2b4387f](https://github.com/liebstoeckel/liebstoeckel-app/commit/2b4387fabeaaa41f1b7560c3efab30e2f6a660f0))
* **engine:** QR overlays dismiss consistently — Esc everywhere + a ✕ on the share ([405d983](https://github.com/liebstoeckel/liebstoeckel-app/commit/405d983bcb66f375c7cd22ee45e3246be83fec7a))
* **engine:** size the presenter "Next up" preview so it fills its box ([da39584](https://github.com/liebstoeckel/liebstoeckel-app/commit/da3958421cf60f455cf35d24298edb97828054d7))
* **live:** guard relay broadcast + half-open detection (keepalive + watchdog) ([6c2db23](https://github.com/liebstoeckel/liebstoeckel-app/commit/6c2db234e659c670968f62ead897133af061bf5c))
* **plugin-qa,engine:** presenter Q&A queue fills the panel; hide focus toggle on mobile ([16eaff2](https://github.com/liebstoeckel/liebstoeckel-app/commit/16eaff2c67f54fc94774d088775dc055b31198db))
* **presenter:** render previews live (crisp), raise thumbnail res to native 1280x720 ([29c7a42](https://github.com/liebstoeckel/liebstoeckel-app/commit/29c7a42e75b2cbc77ee4101593d56738f65ab749))
* **reactions:** linger longer + open in a non-blurring popover ([94ce202](https://github.com/liebstoeckel/liebstoeckel-app/commit/94ce202ff302b67bcd5a04656e525c2f6c3d1ef2))
* **thumbnails:** drop "offline / start the server" chrome in captures ([57d987b](https://github.com/liebstoeckel/liebstoeckel-app/commit/57d987b1e50fa38aae3679dc1aba45b85611089c))


### Code Refactoring

* rename present-it → liebstoeckel ([1c1dba6](https://github.com/liebstoeckel/liebstoeckel-app/commit/1c1dba6e34502aff8df6bab2f1183ef40bc83a0b))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @liebstoeckel/components bumped to 0.3.0
    * @liebstoeckel/plugin-sdk bumped to 0.3.0
    * @liebstoeckel/plugin-ui bumped to 0.3.0
    * @liebstoeckel/theme bumped to 0.3.0

## [0.2.1](https://github.com/liebstoeckel/liebstoeckel-app/compare/engine-v0.2.0...engine-v0.2.1) (2026-06-07)


### Features

* **deck:** build output as &lt;slug&gt;.html + server-side title precedence ((internal ADR)) ([968ec51](https://github.com/liebstoeckel/liebstoeckel-app/commit/968ec513e017002fbeef03c76d72c3961156c406))
* **live:** recovery primitives — crash detection + reconnect escalation ((internal ticket)) ([ec86815](https://github.com/liebstoeckel/liebstoeckel-app/commit/ec8681564c361853006e9d1514c605caf051e64d))


### Bug Fixes

* **engine:** gate presenter view + presenter-only shortcuts on live role ((internal ADR)) ([e6844d9](https://github.com/liebstoeckel/liebstoeckel-app/commit/e6844d9de020420c10b7acc3d9b0179a335a3c5a))

## [0.2.0](https://github.com/liebstoeckel/liebstoeckel-app/compare/engine-v0.1.0...engine-v0.2.0) (2026-06-02)


### ⚠ BREAKING CHANGES

* npm scope, CLI binary, env vars and runtime globals renamed.

### Features

* **agent:** agent-readable CLI/registry + liebstoeckel-deck skill ((internal ADR)/0045) ([a760569](https://github.com/liebstoeckel/liebstoeckel-app/commit/a760569749e40cbc85a96c5d187e375221cabb01))
* **cli:** scaffold real ^version deck deps; version framework 0.1.0 ((internal ADR)) ([ebf6b82](https://github.com/liebstoeckel/liebstoeckel-app/commit/ebf6b82acda1f8f274cd3dd42b822a1b88968e68))
* **code:** build-time Shiki highlighting + animated CodeMagic ([90a4b56](https://github.com/liebstoeckel/liebstoeckel-app/commit/90a4b56d39b0640caaec9bfb7799e600d958a0f3))
* **engine,cli:** inline source package — compiled decks are ejectable ((internal ADR)) ([370fba0](https://github.com/liebstoeckel/liebstoeckel-app/commit/370fba0078b77c7dc8122c2d3e8045ebedfc888a))
* **engine,plugin-sdk:** global panel sheet mode + visual-viewport pinning ((internal ADR)) ([a5da075](https://github.com/liebstoeckel/liebstoeckel-app/commit/a5da0759b89758086745546703f94a7775dc5f6f))
* **engine,plugins:** consistent control icons + mobile chrome overflow ((internal ADR)) ([05ae897](https://github.com/liebstoeckel/liebstoeckel-app/commit/05ae89720ef05cb11e1ba2fa518f3a8c7080cc90))
* **engine:** brandThemes — decks define their own brand; t-cycle desktop-only ([b6401b5](https://github.com/liebstoeckel/liebstoeckel-app/commit/b6401b55246e0481da6bab27e2e3ca778e2cb075))
* **engine:** configurable slide transitions + mobile escape hatch ([9b551ce](https://github.com/liebstoeckel/liebstoeckel-app/commit/9b551ce06658da8aeaec158e280bb641ccc8f24a))
* **engine:** mobile presenter view — notes-first confidence monitor + ⋮ entry ((internal ADR)) ([4d4cc97](https://github.com/liebstoeckel/liebstoeckel-app/commit/4d4cc9777c16e364278dffe5209162a085ee14f6))
* **engine:** mobile-friendly deck chrome — device-scale rail, dvh, ⋮ menu ([38c911e](https://github.com/liebstoeckel/liebstoeckel-app/commit/38c911e69b5d29470700c7aabbfc3199452fdf64))
* **engine:** Plugin instance prop + instance-aware presenter console ([5b4c5d3](https://github.com/liebstoeckel/liebstoeckel-app/commit/5b4c5d3e56d5b155f137b4b68fb82b86ec6a9284))
* **engine:** presenter console — one tab per type + instance dropdown ((internal ADR)) ([d63afdf](https://github.com/liebstoeckel/liebstoeckel-app/commit/d63afdfdd01b8d96a36efc44ca162342ca6574c6))
* **engine:** presenter console panel + focus mode ([3f5e9c9](https://github.com/liebstoeckel/liebstoeckel-app/commit/3f5e9c9ee84ff6261e747e27e6a5837f978d3460))
* **engine:** presenter view shares both QRs (follow-along + drive-from-phone) on Q ([ef1cdcc](https://github.com/liebstoeckel/liebstoeckel-app/commit/ef1cdcc4ea723beb7a9236eb3f91ea2d7bfa4316))
* **engine:** shared presenter timer via the doc ((internal ADR)) ([8943597](https://github.com/liebstoeckel/liebstoeckel-app/commit/8943597f58b23c29e9c735000c02ee760118bfac))
* **export:** PNG/PDF slide export — single slide, range, or whole deck ([430a687](https://github.com/liebstoeckel/liebstoeckel-app/commit/430a687704ba94910317e7d15ec78142f199903d))
* **featureset-3:** build-time thumbnails + secure public relay ([dd3feba](https://github.com/liebstoeckel/liebstoeckel-app/commit/dd3febadd8641f64657d5298b29ea5242f34bc64))
* **live:** audience write-scope enforcement for hosted sessions ((internal ADR), phase 1) ([c65e4ea](https://github.com/liebstoeckel/liebstoeckel-app/commit/c65e4ea11ac1780e9542d5fabfb57e6ad36e132a))
* **mobile:** tap-to-interact plugin breakout on touch screens ([584174d](https://github.com/liebstoeckel/liebstoeckel-app/commit/584174d26479ef02889664770b62cf0b6554cd79))
* **mobile:** touch navigation, portrait hint, responsive presenter ([4bd616c](https://github.com/liebstoeckel/liebstoeckel-app/commit/4bd616ce33b629439958643d80d0c61bb9f93fd0))
* **plugin-qa:** ask from any slide via global chrome surfaces ((internal ADR)) ([16e5938](https://github.com/liebstoeckel/liebstoeckel-app/commit/16e593882a75c3d6bcb9948b3257566d4e29d05d))
* **plugins:** deck-wide global plugin surfaces (overlay/control/panel) ([6068dcb](https://github.com/liebstoeckel/liebstoeckel-app/commit/6068dcb757bafe56905a078f50eac5544ef81ef4))
* **presenter:** prominent step/reveal indicator ([f8e7f6c](https://github.com/liebstoeckel/liebstoeckel-app/commit/f8e7f6c3a6137e419564d7967ac4ce88fb783c5c))
* **registry:** shadcn-style component registry + visx chart gallery ([00fd894](https://github.com/liebstoeckel/liebstoeckel-app/commit/00fd8944f888a990afe6d4dfef5463478d6324cd))
* **relay:** enable the presenter pop-out (P) — sandbox allow-popups ([d6f2c70](https://github.com/liebstoeckel/liebstoeckel-app/commit/d6f2c70e0192aa3fd5b93a5749ae6ba6f9a17fa5))
* **theme:** liebstoeckel "Noir" house brand + Schibsted font ([c8549b6](https://github.com/liebstoeckel/liebstoeckel-app/commit/c8549b64f18d12a811983188cc598e2e09b1f51b))
* **thumbnails:** render plugin fallbacks in captured thumbnails ([d9f2df9](https://github.com/liebstoeckel/liebstoeckel-app/commit/d9f2df9622700968c81fc20634c3feacfe7f20bb))


### Bug Fixes

* **build:** robust single-file output for &lt;/script&gt; and &lt;/body&gt; in JS strings ([8224fe6](https://github.com/liebstoeckel/liebstoeckel-app/commit/8224fe695094466c25f8f90f7826ddaab3ec4f6d))
* **engine:** don't fire global deck shortcuts while typing in a plugin input ([230b488](https://github.com/liebstoeckel/liebstoeckel-app/commit/230b48818ee6006731501128d2785e6276bd8c00))
* **engine:** gray out presenter Next at deck end (and Prev at start) ([0e85d04](https://github.com/liebstoeckel/liebstoeckel-app/commit/0e85d04257b48c06ac0ddd331f45cfacaf78e4b4))
* **engine:** isolate each plugin surface's Motion layout so a panel can't steal the slide's rows ([76708a0](https://github.com/liebstoeckel/liebstoeckel-app/commit/76708a0b19e6319e9736131ccea550f7e37e1949))
* **engine:** Motion-track the ScaledStage transform so layoutId morphs are scale-correct ([a154fbd](https://github.com/liebstoeckel/liebstoeckel-app/commit/a154fbdee286ad56c998d7006cca254b40b7ffe5))
* **engine:** persistent element — scale-correct, fades with transition, travel vs snap ([65a825c](https://github.com/liebstoeckel/liebstoeckel-app/commit/65a825ca477e913c9f3e83685ed9b1f93a4c97c0))
* **engine:** position persistent slot elements correctly when the stage is scaled ([f85a3ea](https://github.com/liebstoeckel/liebstoeckel-app/commit/f85a3eaafc5a2334c092a9fa8f603e57ff30f197))
* **engine:** presenter next-slide preview is pointer-inert ((internal ADR)) ([2b4387f](https://github.com/liebstoeckel/liebstoeckel-app/commit/2b4387fabeaaa41f1b7560c3efab30e2f6a660f0))
* **engine:** QR overlays dismiss consistently — Esc everywhere + a ✕ on the share ([405d983](https://github.com/liebstoeckel/liebstoeckel-app/commit/405d983bcb66f375c7cd22ee45e3246be83fec7a))
* **engine:** size the presenter "Next up" preview so it fills its box ([da39584](https://github.com/liebstoeckel/liebstoeckel-app/commit/da3958421cf60f455cf35d24298edb97828054d7))
* **live:** guard relay broadcast + half-open detection (keepalive + watchdog) ([6c2db23](https://github.com/liebstoeckel/liebstoeckel-app/commit/6c2db234e659c670968f62ead897133af061bf5c))
* **plugin-qa,engine:** presenter Q&A queue fills the panel; hide focus toggle on mobile ([16eaff2](https://github.com/liebstoeckel/liebstoeckel-app/commit/16eaff2c67f54fc94774d088775dc055b31198db))
* **presenter:** render previews live (crisp), raise thumbnail res to native 1280x720 ([29c7a42](https://github.com/liebstoeckel/liebstoeckel-app/commit/29c7a42e75b2cbc77ee4101593d56738f65ab749))
* **reactions:** linger longer + open in a non-blurring popover ([94ce202](https://github.com/liebstoeckel/liebstoeckel-app/commit/94ce202ff302b67bcd5a04656e525c2f6c3d1ef2))
* **thumbnails:** drop "offline / start the server" chrome in captures ([57d987b](https://github.com/liebstoeckel/liebstoeckel-app/commit/57d987b1e50fa38aae3679dc1aba45b85611089c))


### Code Refactoring

* rename present-it → liebstoeckel ([1c1dba6](https://github.com/liebstoeckel/liebstoeckel-app/commit/1c1dba6e34502aff8df6bab2f1183ef40bc83a0b))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @liebstoeckel/components bumped to 0.2.0
    * @liebstoeckel/plugin-sdk bumped to 0.2.0
    * @liebstoeckel/plugin-ui bumped to 0.2.0
    * @liebstoeckel/theme bumped to 0.2.0
