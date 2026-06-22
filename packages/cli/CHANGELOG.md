# Changelog

## [0.3.7](https://github.com/liebstoeckel/liebstoeckel-app/compare/cli-v0.3.6...cli-v0.3.7) (2026-06-22)


### Features

* **build:** caret cross-dep ranges + single-copy guard ((internal ADR)) ([d3a9e28](https://github.com/liebstoeckel/liebstoeckel-app/commit/d3a9e28049b79b7ffed66ecae2ba8fd7be2932ce))
* **build:** stamp engine + CLI versions into built decks ([fd3422f](https://github.com/liebstoeckel/liebstoeckel-app/commit/fd3422f8fa53fd43f9b7eb3c7672582f05137d52))
* **cli:** add skills for live plugins and custom plugin authoring ([4b51842](https://github.com/liebstoeckel/liebstoeckel-app/commit/4b518424a18feb4c52420bd9acc69ad3d85fe6ea))
* **cli:** gate building an untrusted deck and warn on speaker notes ([b1b42f2](https://github.com/liebstoeckel/liebstoeckel-app/commit/b1b42f2d0305a8e54d48570679473049a8e8be60))


### Bug Fixes

* address pre-1.0 release QA findings across CLI, engine, docs ([598b41f](https://github.com/liebstoeckel/liebstoeckel-app/commit/598b41f2cf5812638a3426a4930c24e9500a469e))
* **cli:** compare registry origins before attaching the cloud token ([99e928b](https://github.com/liebstoeckel/liebstoeckel-app/commit/99e928b72d2aab040253e931f091b323f2ecb998))
* **cli:** frame deck-trust as a human decision, stop advertising --trust to agents ([36acc71](https://github.com/liebstoeckel/liebstoeckel-app/commit/36acc716394409a7bdf6d01cea069d03590e4cbc))
* **oss-release:** clear pre-release review blockers across OSS packages ([fd55fb0](https://github.com/liebstoeckel/liebstoeckel-app/commit/fd55fb00715fdb4a9aaf9fe49f75240932d1fc8f))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @liebstoeckel/engine bumped to 0.3.5
    * @liebstoeckel/live-server bumped to 0.3.5
    * @liebstoeckel/present-relay bumped to 0.3.5
    * @liebstoeckel/registry bumped to 0.3.4
    * @liebstoeckel/thumbnails bumped to 0.3.5

## [0.3.6](https://github.com/liebstoeckel/liebstoeckel-app/compare/cli-v0.3.5...cli-v0.3.6) (2026-06-13)


### Features

* **engine,cli:** embed bundle-time third-party license notices in every deck ([c165bf2](https://github.com/liebstoeckel/liebstoeckel-app/commit/c165bf284168b19a34779a79a4dd59656de55429))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @liebstoeckel/engine bumped to 0.3.4
    * @liebstoeckel/live-server bumped to 0.3.4
    * @liebstoeckel/present-relay bumped to 0.3.4
    * @liebstoeckel/thumbnails bumped to 0.3.4

## [0.3.5](https://github.com/liebstoeckel/liebstoeckel-app/compare/cli-v0.3.4...cli-v0.3.5) (2026-06-13)


### Features

* **cli:** label cloud commands as coming soon ([ed26d0d](https://github.com/liebstoeckel/liebstoeckel-app/commit/ed26d0d6a7ec1c5f80aa74c6402ac8b8899febb4))
* **cli:** update reminder, skill staleness warning, and `skill update` ([372b3c0](https://github.com/liebstoeckel/liebstoeckel-app/commit/372b3c05aece2a2ab6255ecdb706c1b09673cd46))

## [0.3.4](https://github.com/liebstoeckel/liebstoeckel-app/compare/cli-v0.3.3...cli-v0.3.4) (2026-06-09)


### Bug Fixes

* **cli:** scaffold depRange fails loud instead of guessing the CLI version ([c58f42b](https://github.com/liebstoeckel/liebstoeckel-app/commit/c58f42b27816eabb76352333e60d038d587631d8))

## [0.3.3](https://github.com/liebstoeckel/liebstoeckel-app/compare/cli-v0.3.2...cli-v0.3.3) (2026-06-09)


### Bug Fixes

* **mirror:** neutralize private refs + public-safe config in OSS mirror ([7c9f0cb](https://github.com/liebstoeckel/liebstoeckel-app/commit/7c9f0cbf786bc95b5e80f10e00da946b3589e51c))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @liebstoeckel/engine bumped to 0.3.3
    * @liebstoeckel/live-server bumped to 0.3.3
    * @liebstoeckel/present-relay bumped to 0.3.3
    * @liebstoeckel/registry bumped to 0.3.3
    * @liebstoeckel/theme bumped to 0.3.3
    * @liebstoeckel/thumbnails bumped to 0.3.3

## [0.3.2](https://github.com/liebstoeckel/liebstoeckel-app/compare/cli-v0.3.1...cli-v0.3.2) (2026-06-07)


### Miscellaneous Chores

* **cli:** Synchronize liebstoeckel versions


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @liebstoeckel/engine bumped to 0.3.2
    * @liebstoeckel/live-server bumped to 0.3.2
    * @liebstoeckel/present-relay bumped to 0.3.2
    * @liebstoeckel/registry bumped to 0.3.2
    * @liebstoeckel/theme bumped to 0.3.2
    * @liebstoeckel/thumbnails bumped to 0.3.2

## [0.3.1](https://github.com/liebstoeckel/liebstoeckel-app/compare/cli-v0.3.0...cli-v0.3.1) (2026-06-07)


### ⚠ BREAKING CHANGES

* npm scope, CLI binary, env vars and runtime globals renamed.

### Features

* **agent:** agent-readable CLI/registry + liebstoeckel-deck skill ((internal ADR)/0045) ([a760569](https://github.com/liebstoeckel/liebstoeckel-app/commit/a760569749e40cbc85a96c5d187e375221cabb01))
* **brand:** carry the viz (chart-series) palette in org brands ((internal ticket)) ([df9e825](https://github.com/liebstoeckel/liebstoeckel-app/commit/df9e825357561dc0302b368a2448ef891554e364))
* **brand:** font catalog — pulled brands import + install their [@fontsource](https://github.com/fontsource) webfonts ((internal ADR)) ([406cd8f](https://github.com/liebstoeckel/liebstoeckel-app/commit/406cd8f376f3324504f27973f1bd2fe1e76c4a7f))
* **brand:** the org as an authenticated registry; shared brands as items ((internal ADR)) ([a114adf](https://github.com/liebstoeckel/liebstoeckel-app/commit/a114adf10a0d4346e83e54545c9960f279e4647c))
* **cli:** liebstoeckel login (device flow) + push (deck upload) ([911f810](https://github.com/liebstoeckel/liebstoeckel-app/commit/911f810bc14cadd57862b6826f587833ab2b2436))
* **cli:** scaffold real ^version deck deps; version framework 0.1.0 ((internal ADR)) ([ebf6b82](https://github.com/liebstoeckel/liebstoeckel-app/commit/ebf6b82acda1f8f274cd3dd42b822a1b88968e68))
* **cli:** umbrella present-it CLI with deck scaffolding ([92e03b0](https://github.com/liebstoeckel/liebstoeckel-app/commit/92e03b0b23f213bbf53261abb21fd74535a533d3))
* **cli:** uniform deck targeting — cwd default + --dir override ((internal ADR)) ([1d8ddf5](https://github.com/liebstoeckel/liebstoeckel-app/commit/1d8ddf538d2c59265b29d8d81dbd73775dd9b8d2))
* **control-plane:** teams — organizations, members, roles & deck metadata ((internal ADR)/0054) ([6444374](https://github.com/liebstoeckel/liebstoeckel-app/commit/6444374578509157f6692e955c6fbf47abd43ca9))
* **deck:** build output as &lt;slug&gt;.html + server-side title precedence ((internal ADR)) ([968ec51](https://github.com/liebstoeckel/liebstoeckel-app/commit/968ec513e017002fbeef03c76d72c3961156c406))
* **decks:** versioning — update-in-place at a stable URL ((internal ADR)) ([bc87aba](https://github.com/liebstoeckel/liebstoeckel-app/commit/bc87aba16e96d99fd8fd2e8c169412eda7fbb9a8))
* **engine,cli:** inline source package — compiled decks are ejectable ((internal ADR)) ([370fba0](https://github.com/liebstoeckel/liebstoeckel-app/commit/370fba0078b77c7dc8122c2d3e8045ebedfc888a))
* **export:** PNG/PDF slide export — single slide, range, or whole deck ([430a687](https://github.com/liebstoeckel/liebstoeckel-app/commit/430a687704ba94910317e7d15ec78142f199903d))
* **registry:** shadcn-style component registry + visx chart gallery ([00fd894](https://github.com/liebstoeckel/liebstoeckel-app/commit/00fd8944f888a990afe6d4dfef5463478d6324cd))
* **saas:** view analytics, custom share controls, plan entitlements & CLI org targeting ([73a7ec4](https://github.com/liebstoeckel/liebstoeckel-app/commit/73a7ec48aff4bfe7b9d816640ecd901a30e086ce))
* **theme:** liebstoeckel "Noir" house brand + Schibsted font ([c8549b6](https://github.com/liebstoeckel/liebstoeckel-app/commit/c8549b64f18d12a811983188cc598e2e09b1f51b))


### Bug Fixes

* **cli:** `new` scaffolds into the cwd (./&lt;name&gt;), not ./presentations/&lt;name&gt; ([244f37c](https://github.com/liebstoeckel/liebstoeckel-app/commit/244f37cfc5c5ae202308aaa107306c95d0ea5d8f))
* **cli:** fix --help on subcommands + docs/usability papercuts (audit) ([b68882b](https://github.com/liebstoeckel/liebstoeckel-app/commit/b68882beaa60a714ac215e3124f13a7209a74b35))
* **cli:** scaffold reads each dep's own version (independent versioning) ([28b3bf5](https://github.com/liebstoeckel/liebstoeckel-app/commit/28b3bf55dae06391f2d95824cc1207f8b84f3839))
* **deps:** keep exact workspace pins for cross-deps (revert caret) ([6526a68](https://github.com/liebstoeckel/liebstoeckel-app/commit/6526a68b799a724bfbe6e9467e79d531c9227cb5))
* **deps:** use caret ranges for workspace cross-deps ([3675d30](https://github.com/liebstoeckel/liebstoeckel-app/commit/3675d30829a97ffcf9a47c4e8d9f9f505d86b4a4))


### Miscellaneous Chores

* force release 0.3.1 (supersede broken 0.3.0 closure) ([87f1142](https://github.com/liebstoeckel/liebstoeckel-app/commit/87f1142a44d814ab86f2112a2e9c8dcd705fb57c))


### Code Refactoring

* rename present-it → liebstoeckel ([1c1dba6](https://github.com/liebstoeckel/liebstoeckel-app/commit/1c1dba6e34502aff8df6bab2f1183ef40bc83a0b))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @liebstoeckel/engine bumped to 0.3.1
    * @liebstoeckel/live-server bumped to 0.3.1
    * @liebstoeckel/present-relay bumped to 0.3.1
    * @liebstoeckel/registry bumped to 0.3.1
    * @liebstoeckel/theme bumped to 0.3.1
    * @liebstoeckel/thumbnails bumped to 0.3.1

## [0.3.0](https://github.com/liebstoeckel/liebstoeckel-app/compare/cli-v0.2.1...cli-v0.3.0) (2026-06-07)


### Bug Fixes

* **deps:** keep exact workspace pins for cross-deps (revert caret) ([6526a68](https://github.com/liebstoeckel/liebstoeckel-app/commit/6526a68b799a724bfbe6e9467e79d531c9227cb5))
* **deps:** use caret ranges for workspace cross-deps ([3675d30](https://github.com/liebstoeckel/liebstoeckel-app/commit/3675d30829a97ffcf9a47c4e8d9f9f505d86b4a4))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @liebstoeckel/engine bumped to 0.3.0
    * @liebstoeckel/live-server bumped to 0.3.0
    * @liebstoeckel/present-relay bumped to 0.3.0
    * @liebstoeckel/registry bumped to 0.3.0
    * @liebstoeckel/theme bumped to 0.3.0
    * @liebstoeckel/thumbnails bumped to 0.3.0

## [0.2.1](https://github.com/liebstoeckel/liebstoeckel-app/compare/cli-v0.2.0...cli-v0.2.1) (2026-06-07)


### Features

* **brand:** carry the viz (chart-series) palette in org brands ((internal ticket)) ([df9e825](https://github.com/liebstoeckel/liebstoeckel-app/commit/df9e825357561dc0302b368a2448ef891554e364))
* **brand:** font catalog — pulled brands import + install their [@fontsource](https://github.com/fontsource) webfonts ((internal ADR)) ([406cd8f](https://github.com/liebstoeckel/liebstoeckel-app/commit/406cd8f376f3324504f27973f1bd2fe1e76c4a7f))
* **deck:** build output as &lt;slug&gt;.html + server-side title precedence ((internal ADR)) ([968ec51](https://github.com/liebstoeckel/liebstoeckel-app/commit/968ec513e017002fbeef03c76d72c3961156c406))


### Bug Fixes

* **cli:** fix --help on subcommands + docs/usability papercuts (audit) ([b68882b](https://github.com/liebstoeckel/liebstoeckel-app/commit/b68882beaa60a714ac215e3124f13a7209a74b35))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @liebstoeckel/engine bumped to 0.2.1
    * @liebstoeckel/live-server bumped to 0.2.1
    * @liebstoeckel/present-relay bumped to 0.2.1
    * @liebstoeckel/thumbnails bumped to 0.2.1

## [0.2.0](https://github.com/liebstoeckel/liebstoeckel-app/compare/cli-v0.1.0...cli-v0.2.0) (2026-06-02)


### ⚠ BREAKING CHANGES

* npm scope, CLI binary, env vars and runtime globals renamed.

### Features

* **agent:** agent-readable CLI/registry + liebstoeckel-deck skill ((internal ADR)/0045) ([a760569](https://github.com/liebstoeckel/liebstoeckel-app/commit/a760569749e40cbc85a96c5d187e375221cabb01))
* **brand:** the org as an authenticated registry; shared brands as items ((internal ADR)) ([a114adf](https://github.com/liebstoeckel/liebstoeckel-app/commit/a114adf10a0d4346e83e54545c9960f279e4647c))
* **cli:** liebstoeckel login (device flow) + push (deck upload) ([911f810](https://github.com/liebstoeckel/liebstoeckel-app/commit/911f810bc14cadd57862b6826f587833ab2b2436))
* **cli:** scaffold real ^version deck deps; version framework 0.1.0 ((internal ADR)) ([ebf6b82](https://github.com/liebstoeckel/liebstoeckel-app/commit/ebf6b82acda1f8f274cd3dd42b822a1b88968e68))
* **cli:** umbrella present-it CLI with deck scaffolding ([92e03b0](https://github.com/liebstoeckel/liebstoeckel-app/commit/92e03b0b23f213bbf53261abb21fd74535a533d3))
* **cli:** uniform deck targeting — cwd default + --dir override ((internal ADR)) ([1d8ddf5](https://github.com/liebstoeckel/liebstoeckel-app/commit/1d8ddf538d2c59265b29d8d81dbd73775dd9b8d2))
* **control-plane:** teams — organizations, members, roles & deck metadata ((internal ADR)/0054) ([6444374](https://github.com/liebstoeckel/liebstoeckel-app/commit/6444374578509157f6692e955c6fbf47abd43ca9))
* **decks:** versioning — update-in-place at a stable URL ((internal ADR)) ([bc87aba](https://github.com/liebstoeckel/liebstoeckel-app/commit/bc87aba16e96d99fd8fd2e8c169412eda7fbb9a8))
* **engine,cli:** inline source package — compiled decks are ejectable ((internal ADR)) ([370fba0](https://github.com/liebstoeckel/liebstoeckel-app/commit/370fba0078b77c7dc8122c2d3e8045ebedfc888a))
* **export:** PNG/PDF slide export — single slide, range, or whole deck ([430a687](https://github.com/liebstoeckel/liebstoeckel-app/commit/430a687704ba94910317e7d15ec78142f199903d))
* **registry:** shadcn-style component registry + visx chart gallery ([00fd894](https://github.com/liebstoeckel/liebstoeckel-app/commit/00fd8944f888a990afe6d4dfef5463478d6324cd))
* **saas:** view analytics, custom share controls, plan entitlements & CLI org targeting ([73a7ec4](https://github.com/liebstoeckel/liebstoeckel-app/commit/73a7ec48aff4bfe7b9d816640ecd901a30e086ce))
* **theme:** liebstoeckel "Noir" house brand + Schibsted font ([c8549b6](https://github.com/liebstoeckel/liebstoeckel-app/commit/c8549b64f18d12a811983188cc598e2e09b1f51b))


### Bug Fixes

* **cli:** `new` scaffolds into the cwd (./&lt;name&gt;), not ./presentations/&lt;name&gt; ([244f37c](https://github.com/liebstoeckel/liebstoeckel-app/commit/244f37cfc5c5ae202308aaa107306c95d0ea5d8f))
* **cli:** scaffold reads each dep's own version (independent versioning) ([28b3bf5](https://github.com/liebstoeckel/liebstoeckel-app/commit/28b3bf55dae06391f2d95824cc1207f8b84f3839))


### Code Refactoring

* rename present-it → liebstoeckel ([1c1dba6](https://github.com/liebstoeckel/liebstoeckel-app/commit/1c1dba6e34502aff8df6bab2f1183ef40bc83a0b))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @liebstoeckel/engine bumped to 0.2.0
    * @liebstoeckel/live-server bumped to 0.2.0
    * @liebstoeckel/present-relay bumped to 0.2.0
    * @liebstoeckel/registry bumped to 0.1.1
    * @liebstoeckel/theme bumped to 0.2.0
    * @liebstoeckel/thumbnails bumped to 0.2.0
