# Vitals Monitor

<p align="center">
  <img src="assets/icons/vitals-monitor.png" alt="Vitals Monitor logo" width="112" height="112">
</p>

<p align="center"><strong>See abnormal system behavior as it happens, and keep the evidence that explains it.</strong></p>

Vitals Monitor is a Windows system-health dashboard that watches hardware, storage, and network telemetry in the background, automatically captures abnormal periods to a local SQLite database, and turns them into dense, exportable timelines for diagnosis.

[Read the user guide](docs/user-guide.html) | [Ad-free support](#free-and-ad-free) | [Build from source](#build-from-source) | [Create an installer](#create-a-windows-installer)

## Why Vitals Monitor

Most hardware monitors either show the present moment or record everything indefinitely. Vitals Monitor keeps a lightweight five-sample working set during normal operation, detects meaningful changes and threshold violations, then automatically switches to one-second polling and database logging while the event is active.

The result is a focused record of the periods that are most useful when diagnosing heat, load, storage, cooling, voltage, or network problems.

## Free And Ad-Free

Vitals Monitor is an independent community project supported by [SorryNeedBoost Studios](https://sorryneedboost.com). It is free to install and use, contains no third-party advertising, and does not interrupt monitoring with sponsored content, promotional gates, or bundled offers.

For a distributable desktop application, that support goes toward product design, engineering, testing, documentation, packaging, distribution, and ongoing maintenance. The model is intentionally straightforward: keep promotion subordinate to the user's workflow and let the product introduce the studio through the quality of the work.

## Highlights

- Dense VS Code-dark dashboard designed for high information density.
- Automatic realtime logging when a metric becomes abnormal or changes significantly.
- Manual realtime recording from the dashboard or system-tray menu.
- CPU, GPU, motherboard, memory, fan, voltage, disk, latency, jitter, and packet-loss telemetry where Windows and installed sensor providers expose it.
- Historical chart with explicit logging start, stop, and user marker events.
- Collapsible gauge rails and pinnable five-sample trend popovers.
- Configurable polling rates, latency target, and warning thresholds.
- Time-range export to portable JSON and import for analysis on another computer.
- Local SQLite storage with hostname, IP address, and system-build context.
- Custom frameless window, dark controls, alternate recording tray icon, and launch-to-tray support.

## Requirements

- 64-bit Windows 10 version 1809 or newer, or Windows 11.
- Administrator approval during installation.
- A working network route to the configured latency target for latency, jitter, and packet-loss measurements.
- Optional: [LibreHardwareMonitor](https://github.com/LibreHardwareMonitor/LibreHardwareMonitor) or [Open Hardware Monitor](https://openhardwaremonitor.org/) with its WMI sensor interface available for broader motherboard temperature, voltage, and fan coverage.

Sensor availability depends on the motherboard, GPU, firmware, drivers, and monitoring interfaces exposed by the machine. An unavailable value is displayed as `N/A`; it is not treated as a warning.

## Install And Start

1. Download the latest `Vitals-Monitor-Setup-<version>-x64.exe` from the repository release.
2. Run the installer and approve the Windows administrator prompt.
3. Choose optional desktop and launch-at-startup shortcuts.
4. Start Vitals Monitor from the Start menu.

The app begins monitoring immediately. Closing the main window sends it to the system tray; it does not stop monitoring. Double-click the tray icon to restore the dashboard, or right-click it for logging, guide, and quit commands.

## How Recording Works

1. Normal monitoring polls every 10 seconds by default and retains the latest five sample sets in memory.
2. A warning, critical value, or significant five-sample change starts automatic logging.
3. Polling changes to one second and every metric is written to the local SQLite database.
4. Automatic logging stops after all monitored values return to normal and the five-sample window stabilizes.
5. Manual logging continues until you explicitly stop it.

Defaults are editable from **Settings**. Choose **Help** in the app status bar for the complete guide.

## Data And Privacy

Vitals Monitor processes telemetry locally and does not upload collected system data. The database is stored in the current Windows profile under:

```text
%APPDATA%\Vitals Monitor\data\vitals-monitor.sqlite3
```

Network quality measurement sends ICMP echo requests to the configured latency target, which defaults to `1.1.1.1`. JSON exports contain the readings, events, hostname, IP address, and system-build information for the selected period; review them before sharing.

## Distribution Description

Use this copy for software listings, release pages, and distribution channels:

> Vitals Monitor is a free, ad-free Windows system-health dashboard that watches hardware, storage, and network telemetry in the background, automatically captures abnormal periods to a local SQLite database, and turns them into dense, exportable timelines for diagnosis. It is supported by SorryNeedBoost Studios.

Short listing line:

> Free and ad-free, Vitals Monitor watches Windows hardware, storage, and network health and automatically logs abnormal periods for fast visual diagnosis.

## Build From Source

Prerequisites: Node.js, npm, Git, and Windows.

```powershell
git clone <repository-url>
cd vitalMon
npm install
npm run dev
```

Verification commands:

```powershell
npm run typecheck
npm run build
npm audit
```

## Create A Windows Installer

Install [Inno Setup 6](https://jrsoftware.org/isinfo.php), then run:

```powershell
npm run dist:inno
```

The finished installer is written to `release/inno/`. The build includes the standalone [HTML user guide](docs/user-guide.html), which can also be published unchanged by a static website.

## Documentation

- [User guide](docs/user-guide.html)
- [Build guide](docs/developer/build.md)
- [Deployment guide](docs/developer/deployment.md)
- [Testing guide](docs/developer/testing.md)
- [Manual QA](docs/manual-qa.md)

## Version

Current application version: `0.1.0`
