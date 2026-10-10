# Changelog

All notable changes to ovc-frontend. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/). Each version is a git tag
(`0.1.2`, no `v` prefix) with a matching GitHub Release and container image
(`ghcr.io/claudio-azevedo/ovc-frontend:<version>`).

## [Unreleased]

### Added

- "VMware Nostalgia" theme: the vSphere HTML5 Client look, after VMware's
  Clarity Design System. Pick it on the login screen or in Preferences ▸ Theme.

### Removed

- View ▸ Task History and the Tasks tab on hosts and VMs: the Events screens
  (admin) are the history now, and Event Details ▸ View Task opens the task.
  Everyone keeps the Recent Tasks dock.

## [0.2.0] - 2026-10-03

### Added

- The About dialog shows the app version.
- Audit log (admin only): View ▸ Events History and an Events tab on clusters,
  hosts and VMs show who changed what and when, with the outcome of agent tasks
  and the before/after of each change. Needs ovc-backend 0.2.0
  (`GET /audit-events`).

### Changed

- Menu items no longer end with an ellipsis (menu bar, VM More ▾, host
  Actions ▾).
- An Off VM's console preview shows "No preview - VM is off" instead of its
  last, stale thumbnail.

## [0.1.2] - 2026-10-03

### Added

- VM tags with categories and colours: File ▸ Tag Management (admin), and
  Summary ▸ Tags ▸ Assign Tag… on each VM.
- VM search dialog in the tree toolbar.
- VM Summary Console box: last console thumbnail, Open Web Console and
  Download RDP; Configuration shows guest OS and provisioned space.
- Host actions menu, host Configuration tab and storage placement rules.
- Theme options.

### Changed

- Consoles connect straight to guacd: the frontend serves the Guacamole
  tunnel itself (`GUACD_URL`, default `localhost:4822`), so ovc-webrdp is no
  longer required. Opening a console needs a signed-in session; audio, file
  transfer and printing are always disabled.
- The tree lists a cluster's hosts before its Templates folder.
- An Off or Paused VM has no console (Console tab and buttons disabled).

### Fixed

- Agent binary upload accepts only `.exe` files.
- About dialog, folder scope, and the Move button when no folder is
  available.

## [0.1.1] - 2026-09-20

### Changed

- The webrdp base URL became a server-side runtime variable instead of a
  build-time one.

## [0.1.0] - 2026-09-20

First public release.

[Unreleased]: https://github.com/claudio-azevedo/Open-vCenter-Frontend/compare/0.2.0...HEAD
[0.2.0]: https://github.com/claudio-azevedo/Open-vCenter-Frontend/compare/0.1.2...0.2.0
[0.1.2]: https://github.com/claudio-azevedo/Open-vCenter-Frontend/compare/0.1.1...0.1.2
[0.1.1]: https://github.com/claudio-azevedo/Open-vCenter-Frontend/compare/0.1.0...0.1.1
[0.1.0]: https://github.com/claudio-azevedo/Open-vCenter-Frontend/releases/tag/0.1.0
