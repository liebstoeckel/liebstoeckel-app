# Changelog

## [0.3.1](https://github.com/liebstoeckel/liebstoeckel-app/compare/dev-server-v0.1.0...dev-server-v0.3.1) (2026-08-31)


### Features

* **cli:** scaffold-migration registry with doctor surface and dev auto-patch ([1d182be](https://github.com/liebstoeckel/liebstoeckel-app/commit/1d182be76937a38e72c88e7b80ae0e80688932f5))
* **dev-mode:** add-slide requests from the sidebar's slide list ([5fcec49](https://github.com/liebstoeckel/liebstoeckel-app/commit/5fcec49c508c6a3d35376a5486fb8ce7e4c02493))
* **dev-mode:** shell at /, plain deck at /deck ([4fa5934](https://github.com/liebstoeckel/liebstoeckel-app/commit/4fa59341cba73b03766cb975417c30eb7f05d46b))
* **dev-mode:** shell page with the sidebar beside the deck frame, postMessage bridge, stage-relative coordinates ([6c8e8da](https://github.com/liebstoeckel/liebstoeckel-app/commit/6c8e8da5cf70e5f71f012c37ede9c6275e6d4891))
* **dev-mode:** show the agent as working while it holds a leased batch ([2867a46](https://github.com/liebstoeckel/liebstoeckel-app/commit/2867a462bd79ad35773ed859720960f339881706))
* **dev-server:** local dev mode with annotation drawer and agent poll loop ([b8fabac](https://github.com/liebstoeckel/liebstoeckel-app/commit/b8fabac25a8bbd5975a28d5af60f49237cfa643e))
* **dev-server:** publish dev mode with the CLI ([6501103](https://github.com/liebstoeckel/liebstoeckel-app/commit/6501103c8216a22bf7fef044049105c0c348e66b))
* **dev-server:** React sidebar shell + dependency-free story runner ([157da37](https://github.com/liebstoeckel/liebstoeckel-app/commit/157da37c0249a8a75319668603ead41b1714917d))
* **dev-server:** sidebar on the house Noir/gold system, a11y and responsive hardening ([aafe052](https://github.com/liebstoeckel/liebstoeckel-app/commit/aafe052280243feed00d574f4cfd9ad581d004a3))


### Bug Fixes

* **dev-mode:** chained request order across batches, staged-batch send guard, revert of unreported files, re-exec signal forwarding ([2d0851c](https://github.com/liebstoeckel/liebstoeckel-app/commit/2d0851c3f01e92f42a226291b739f722e77724bc))
* **dev-mode:** pre-merge review fixes across protocol, sidebar, migrations, and release wiring ([f2e187a](https://github.com/liebstoeckel/liebstoeckel-app/commit/f2e187aae3181d1dd3a3af3365cdc7ea31ac2462))
* **dev-mode:** the shell reloads itself after a server restart, leases last five minutes, presence outlives a reply ([e424ace](https://github.com/liebstoeckel/liebstoeckel-app/commit/e424ace028bff346edc453edbd7d6ce4da2c970b))
* **dev-mode:** whole-tree revert snapshots, request index chain, migration and loader hardening ([2124565](https://github.com/liebstoeckel/liebstoeckel-app/commit/2124565c069920744d370e01a1b55bbc2ca93f8e))
* **dev-server:** demote @liebstoeckel/cli to a peerDependency ([fc7fc76](https://github.com/liebstoeckel/liebstoeckel-app/commit/fc7fc76a50d1a10ebc72e44b0b74a694be4679a4))
* **dev-server:** paper-plane send icon ([b3a6e4a](https://github.com/liebstoeckel/liebstoeckel-app/commit/b3a6e4aa92f1002deaf445b90f0dd41866f91988))
* **dev-server:** resolve namespace slide imports; (internal ticket) done ([92b7ba1](https://github.com/liebstoeckel/liebstoeckel-app/commit/92b7ba13bd10aa9c9ea4040ac19c22948744354a))
* **dev-server:** seal created files at reply, refuse symlink escapes, keep a failed revert retryable ([5d396b0](https://github.com/liebstoeckel/liebstoeckel-app/commit/5d396b04a3b4500761cd8a1a1836961877eedf3b))
* **dev-server:** sidebar overlay mode clips to the shell and leaves the frame column alone ([c025daa](https://github.com/liebstoeckel/liebstoeckel-app/commit/c025daa5ef0147fa18b72317fc38316e92f88078))


### Miscellaneous Chores

* force release 0.3.1 (supersede broken 0.3.0 closure) ([87f1142](https://github.com/liebstoeckel/liebstoeckel-app/commit/87f1142a44d814ab86f2112a2e9c8dcd705fb57c))


### Dependencies

* The following workspace dependencies were updated
  * peerDependencies
    * @liebstoeckel/cli bumped to 0.3.11
