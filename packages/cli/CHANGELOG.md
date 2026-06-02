# Changelog

## [0.2.0](https://github.com/limond/liebstoeckel-app/compare/cli-v0.1.0...cli-v0.2.0) (2026-06-02)


### ⚠ BREAKING CHANGES

* npm scope, CLI binary, env vars and runtime globals renamed.

### Features

* **agent:** agent-readable CLI/registry + liebstoeckel-deck skill (ADR 0044/0045) ([a760569](https://github.com/limond/liebstoeckel-app/commit/a760569749e40cbc85a96c5d187e375221cabb01))
* **brand:** the org as an authenticated registry; shared brands as items (ADR 0059) ([a114adf](https://github.com/limond/liebstoeckel-app/commit/a114adf10a0d4346e83e54545c9960f279e4647c))
* **cli:** liebstoeckel login (device flow) + push (deck upload) ([911f810](https://github.com/limond/liebstoeckel-app/commit/911f810bc14cadd57862b6826f587833ab2b2436))
* **cli:** scaffold real ^version deck deps; version framework 0.1.0 (ADR 0051) ([ebf6b82](https://github.com/limond/liebstoeckel-app/commit/ebf6b82acda1f8f274cd3dd42b822a1b88968e68))
* **cli:** umbrella present-it CLI with deck scaffolding ([92e03b0](https://github.com/limond/liebstoeckel-app/commit/92e03b0b23f213bbf53261abb21fd74535a533d3))
* **cli:** uniform deck targeting — cwd default + --dir override (ADR 0050) ([1d8ddf5](https://github.com/limond/liebstoeckel-app/commit/1d8ddf538d2c59265b29d8d81dbd73775dd9b8d2))
* **control-plane:** teams — organizations, members, roles & deck metadata (ADR 0053/0054) ([6444374](https://github.com/limond/liebstoeckel-app/commit/6444374578509157f6692e955c6fbf47abd43ca9))
* **decks:** versioning — update-in-place at a stable URL (ADR 0058) ([bc87aba](https://github.com/limond/liebstoeckel-app/commit/bc87aba16e96d99fd8fd2e8c169412eda7fbb9a8))
* **engine,cli:** inline source package — compiled decks are ejectable (ADR 0039) ([370fba0](https://github.com/limond/liebstoeckel-app/commit/370fba0078b77c7dc8122c2d3e8045ebedfc888a))
* **export:** PNG/PDF slide export — single slide, range, or whole deck ([430a687](https://github.com/limond/liebstoeckel-app/commit/430a687704ba94910317e7d15ec78142f199903d))
* **registry:** shadcn-style component registry + visx chart gallery ([00fd894](https://github.com/limond/liebstoeckel-app/commit/00fd8944f888a990afe6d4dfef5463478d6324cd))
* **saas:** view analytics, custom share controls, plan entitlements & CLI org targeting ([73a7ec4](https://github.com/limond/liebstoeckel-app/commit/73a7ec48aff4bfe7b9d816640ecd901a30e086ce))
* **theme:** liebstoeckel "Noir" house brand + Schibsted font ([c8549b6](https://github.com/limond/liebstoeckel-app/commit/c8549b64f18d12a811983188cc598e2e09b1f51b))


### Bug Fixes

* **cli:** `new` scaffolds into the cwd (./&lt;name&gt;), not ./presentations/&lt;name&gt; ([244f37c](https://github.com/limond/liebstoeckel-app/commit/244f37cfc5c5ae202308aaa107306c95d0ea5d8f))
* **cli:** scaffold reads each dep's own version (independent versioning) ([28b3bf5](https://github.com/limond/liebstoeckel-app/commit/28b3bf55dae06391f2d95824cc1207f8b84f3839))


### Code Refactoring

* rename present-it → liebstoeckel ([1c1dba6](https://github.com/limond/liebstoeckel-app/commit/1c1dba6e34502aff8df6bab2f1183ef40bc83a0b))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @liebstoeckel/engine bumped to 0.2.0
    * @liebstoeckel/live-server bumped to 0.2.0
    * @liebstoeckel/present-relay bumped to 0.2.0
    * @liebstoeckel/registry bumped to 0.1.1
    * @liebstoeckel/theme bumped to 0.2.0
    * @liebstoeckel/thumbnails bumped to 0.2.0
