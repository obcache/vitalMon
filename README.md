# vitalMon

monitors pc vitals and  upon any abnormal changes, logs and displays them.

## Project Status

- Visibility: Public
- Version: 0.1.0
- Created: 2026-08-22

## Overview

Vitals Monitor is a Windows system-health dashboard that runs quietly in the system tray. It samples hardware, storage, and network metrics, detects significant changes across a rolling five-sample window, and records abnormal periods to a local SQLite database for later analysis.

## Features

- Dense VS Code-dark dashboard with gauges, sparklines, a historical chart, event markers, and collapsible sensor groups.
- Automatic one-second logging when metrics cross configurable thresholds or change significantly.
- Manual realtime logging from the dashboard or tray menu, with a distinct logging tray icon.
- CPU, GPU, motherboard, memory, fan, voltage, disk, latency, and jitter monitoring where exposed by Windows and installed sensor providers.
- JSON range export and import for comparing captures from other systems.
- Frameless Electron window with custom titlebar, controls, scrollbars, and in-page pinnable metric popovers.
- Local SQLite persistence with host, network, and system-build metadata.

## Installation

Build a full Windows installer with Inno Setup 6:

```powershell
npm install
npm run dist:inno
```

The installer is written to `release/inno/`. It installs per user, creates a Start menu shortcut, and offers optional desktop and launch-at-startup shortcuts. Startup launches Vitals Monitor directly into the system tray.

## Usage

Run the development build:

```powershell
npm run dev
```

Closing the window keeps Vitals Monitor running in the tray. Double-click the tray icon to restore it, or right-click for realtime logging and quit controls.

## Development

Project workflow files live under `docs/` and reusable automation lives under `tools/project-mgmt/`.

```powershell
npm run todo
npm run ledger:message
npm run handoff
npm run version:show
```

## Testing

```powershell
npm run typecheck
npm run build
```

## Build And Release

Use `npm run commit -- "message"` for a patch release commit. Use `npm run commit:minor -- "message"` or `npm run commit:major -- "message"` when the change requires a larger version bump.

## Contributing

Document branch, review, commit, and release expectations.

## License

Add licensing details before public distribution.
