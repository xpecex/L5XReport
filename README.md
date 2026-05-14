# L5XReport

Electron app that scans **L5X files** (Rockwell/Allen-Bradley Logix controller XML backups) to detect bypass conditions in ladder logic, then generates an audit report.

## Features

- Select L5X controller backup files via file picker
- Scan ladder logic for bypass patterns (Branch, AFI, NOP, Custom Bit)
- Display results in a report window with pie charts and detailed table
- Print PDF report from results

## Installation

```bash
npm install              # Install dependencies
npm start                # Launch Electron app
npm run test        # Run unit tests for scanner output validation
npm run test:e2e        # Run end-to-end tests with Playwright
```

## Usage

```bash
npm start
```

## Building

```bash
npm run build:full       # Bundle JS + package as installer
npm run build:bundler    # Bundle JS with Rollup
npm run build:package    # Package with Electron Builder
```

## Testing

```bash
npm run test
```

## Architecture

- **`src/main/main.js`** — Electron main process. Creates `BrowserWindow`, sets up app lifecycle events (`ready`, `activate`, `window-all-closed`), disables application menu, registers IPC handlers. F12 toggles DevTools.
- **`src/main/ipcHandlers.js`** — IPC handlers module. Exports `registerIpcHandlers(mainWindow)`, `getActiveWorker`, `setActiveWorker`, `getReportPath`. Wires all IPC events: `select-file`, `clear-file`, `start-scan`, `cancel-scan`, `open-report`, `print-pdf`, `gotoGithub`. Manages `activeWorker` and `reportPath` state. Handles E2E_TEST mode bypass.
- **`src/main/bypass.js`** — Worker script (runs in a separate `worker_threads` thread). Receives `filepath` and `CONFIG` via `workerData`. Parses L5X XML with Cheerio (`xmlMode`), iterates Routines→Rungs, matches bypass patterns, posts `PROGRESS`/`SUCCESS`/`ERROR` messages to the main thread. Skips 'Empty' routines. Optimizations (v1.1): controller metadata cached once, program name/class cached per transition, text extracted only when detection rules active, totals tracked inline during iteration, progress postMessage without `setImmediate` overhead.
- **`src/preload/preload.js`** — Context bridge. Exposes `electronAPI` on `window` with: `selectFile`, `clearFile`, `startScan`, `cancelScan`, `openReport`, `onProgress`, `onComplete`, `onReportData`, `printPdf`, `gotoGithub`, `removeAllListeners`.
- **`src/assets/js/index.js`** — Renderer logic. Manages 3-section UI navigation, file selection, scan config (keywords + checkboxes), progress bar, IPC event listeners (`scan-progress`, `scan-complete`), and controls report button.
- **`src/assets/js/report.js`** — Report rendering logic. Renders pie charts (by level + by bypass type), detailed results table with badges, header info (controller, backup/audit dates), footer.

## Scan Rules

| Rule | Condition | Flag |
|------|-----------|------|
| BRANCH | matches `shortedbranchregex` pattern | `branch` |
| AFI | text contains `"AFI"` | `afi` |
| NOP | text contains `"NOP"` | `nop` |
| CUSTOM BIT | text matches keyword regex | keywords array |

Default keywords: `BYPASS, MANUT, MAINT, MANUTENCAO, MAINTENANCE`

Custom bit regex: `^(keyword)|_(keyword)|\((keyword)` (catches prefixes, underscore, parentheses).

## Output Format

Each scan result contains:

| Field | Description |
|-------|-------------|
| CONTROLLER | Controller name |
| PROGRAM | Program name |
| ROUTINE | Routine name (skips 'Empty') |
| RUNG | Rung number |
| COMMENT | Rung comment text |
| LEVEL | Program class (Safety / Standard) |
| BY-PASS | Comma-separated bypass types |
| BACKUP | Last edit date |
| AUDIT. DATA | Current timestamp |

Worker success payload: `{ results, totalRoutinesScanned, totalPrograms }`

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| electron | ^42.0.0 | Framework |
| cheerio | ^1.2.0 | XML parsing |
| electron-builder | ^26.8.1 | App packaging (NSIS, AppImage, deb) |
| playwright | ^1.60.0 | E2E testing |
| @playwright/test | ^1.60.0 | Test framework |
| @playwright/electron | ^0.0.1 | Electron Playwright API |
| rollup | ^4.60.3 | JS bundling |
| @rollup/plugin-terser | ^1.0.0 | JS minification |

## Project Structure

```
src/main/main.js          Electron main process
src/main/ipcHandlers.js   IPC handlers — worker management, report windows, PDF
src/main/bypass.js        Worker script — L5X scan engine
src/preload/preload.js    Electron preload — context bridge
src/renderer/index.html   Main UI markup (3 sections)
src/renderer/report.html  Report UI markup
src/assets/js/index.js    Renderer logic (UI, scan, navigation)
src/assets/js/report.js   Report rendering (charts, table)
src/assets/js/index.min.js  Minified renderer JS
src/assets/js/report.min.js   Minified report JS
src/assets/css/index.css  Main stylesheet
src/assets/css/report.css Report stylesheet
src/assets/icon/l5xreport.png App icon
__TEST/ProjectTest.L5X   Sample controller backup file
__TEST/bypass.unit.test.js Unit tests (node:test)
__TEST/e2e.test.js       End-to-end tests (Playwright)
playwright.config.ts     Playwright config
rollup.config.js         Rollup bundler config
```

## E2E Testing

Run with `npm run test:e2e`. Launches Electron via Playwright, validates:
1. File selection → 2. Scan configuration → 3. Scan execution → 4. Report rendering → 5. PDF generation
E2E mode bypasses dialogs using `E2E_TEST=true` env flag.

## Author

Pedro Filipe C Ferreira — [xpecex@outlook.com](mailto:xpecex@outlook.com)

## Repository

https://github.com/xpecex/L5XReport.git

## License

GPLv2
