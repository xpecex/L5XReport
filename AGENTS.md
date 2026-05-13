# L5XReport — Agent Guide

## Project

Electron app that scans **L5X files** (Rockwell/Allen-Bradley Logix controller XML backups) to detect bypass conditions in ladder logic, then generates an audit report.

---

## Commands

```bash
npm install              # Install dependencies
npm start                # Launch Electron app
npm run test             # Run unit tests for scanner output validation
npm run test:e2e         # Run end-to-end tests with Playwright
```

---

## Structure

```
src/main/main.js          Electron main process — creates window, app lifecycle, registers IPC handlers
src/main/ipcHandlers.js   IPC handlers — select-file, start-scan, cancel-scan, open-report, print-pdf, gotoGithub
src/main/bypass.js        Worker script — parses L5X XML, scans for bypass patterns
src/preload/preload.js    Electron preload — exposes electronAPI via contextBridge
src/renderer/index.html   Renderer page — UI markup only (3 sections)
src/renderer/report.html  Report page — UI markup only
src/assets/js/index.js    Renderer logic — UI state, IPC handlers, progress management
src/assets/js/report.js   Report rendering logic — charts, table, badges
src/assets/js/index.min.js  Minified renderer JS
src/assets/js/report.min.js   Minified report JS
src/assets/css/index.css  Main stylesheet
src/assets/css/report.css Report stylesheet
src/assets/icon/l5xreport.png App icon
__TEST/ProjectTest.L5X   Sample controller backup file
__TEST/bypass.unit.test.js Unit tests — validates scanner output structure and values
__TEST/e2e.test.js       E2E tests — validates full Electron workflow via Playwright
__TEST/step*.png         E2E test screenshots (auto-cleaned)
playwright.config.ts     Playwright configuration
rollup.config.js         Rollup bundler configuration
```

---

## Architecture

- `main.js` — Electron main process. Creates `BrowserWindow`, sets up app lifecycle events (`ready`, `activate`, `window-all-closed`), disables application menu, and registers `ipcHandlers.js`. F12 toggles DevTools.
- `ipcHandlers.js` — IPC handlers module. Exports `registerIpcHandlers(mainWindow)`, `getActiveWorker`, `setActiveWorker`, `getReportPath`. Wires all IPC events: `select-file`, `clear-file`, `start-scan`, `cancel-scan`, `open-report`, `print-pdf`, `gotoGithub`. Manages `activeWorker` and `reportPath` state. Handles `E2E_TEST=true` env flag to bypass dialogs.
- `bypass.js` — Worker script (runs in a separate `worker_threads` thread). Receives `filepath` and `CONFIG` via `workerData`. Parses L5X XML with Cheerio (`xmlMode: true`), iterates Routines→Rungs, matches bypass patterns, posts `PROGRESS`/`SUCCESS`/`ERROR` messages to the main thread. Skips 'Empty' routines.
- `preload.js` — Context bridge. Exposes `electronAPI` on `window` with: `selectFile`, `clearFile`, `startScan`, `cancelScan`, `openReport`, `onProgress`, `onComplete`, `onReportData`, `printPdf`, `gotoGithub`, `removeAllListeners`.
- `index.js` — Renderer logic. Manages 3-section UI navigation, file selection, scan config (keywords + checkboxes), progress bar, IPC event listeners (`scan-progress`, `scan-complete`), and controls report button.
- `report.js` — Report rendering logic. Renders pie charts (by level + by bypass type), detailed results table with badges, header info (controller, backup/audit dates), footer.

---

## Scan Rules (`bypass.js`)

| Rule          | Condition                              | Flag        |
|---------------|----------------------------------------|-------------|
| BRANCH        | matches `shortedbranchregex` pattern   | `branch`    |
| AFI           | text contains `"AFI"`                  | `afi`       |
| NOP           | text contains `"NOP"`                  | `nop`       |
| CUSTOM BIT    | text matches keyword regex (`keyword$`) | keywords array |

Default keywords: `BYPASS, MANUT, MAINT, MANUTENCAO, MAINTENANCE`.

Custom bit regex: `^(keyword)|_(keyword)|\((keyword)` (catches prefixes, underscore, parentheses).

---

## Output format

Each scan result is a plain object with these fields:

```js
{
  'CONTROLLER': controller name,
  'PROGRAM': program name,
  'ROUTINE': routine name,
  'RUNG': rung number,
  'COMMENT': rung comment text,
  'LEVEL': program class,
  'BY-PASS': comma-separated bypass types,
  'BACKUP': last edit date,
  'AUDIT. DATA': current timestamp
}
```

Worker success payload: `{ results, totalRoutinesScanned, totalPrograms }`.

---

## Testing & CI

### Unit Tests (Scanner)
```bash
npm run test
```
Validates `bypass.js` worker output against `ProjectTest.L5X`. Uses Node's native `node:test` module. Checks structure, counts, and field values.

### E2E Tests (App Workflow)
```bash
npm run test:e2e
```
Launches Electron via `@playwright/electron`. Validates full workflow: file selection → scan → report rendering → PDF generation.
Uses `E2E_TEST=true` env flag to bypass dialogs and use built-in test files.
Automatically captures screenshots and cleans up generated artifacts.

---

## Packaging & Bundling

```bash
npm run build:bundler    # Bundle JS with Rollup (minifies via terser)
npm run build:package    # Package app with Electron Builder (NSIS, AppImage, deb)
npm run build:full       # Run both bundler and packaging steps
```

Electron Builder config (`package.json` → `build`):
- App ID: `xpecex.L5XReport`
- Windows: NSIS x64
- Linux: AppImage & deb x64
- Output: `dist/`
- ASAR enabled

---

## Git Workflow

Before any modification:

1. **Create a versioned branch** — `git checkout -b <branch-name>` (use descriptive lowercase name)
2. **Make the modification**
3. **Run tests** to validate the change
4. **Commit** — message format: `type: description`

Commit types:

| Type       | Usage                              |
|------------|------------------------------------|
| `fix:`     | Bug fixes (e.g., `fix: print button not working`) |
| `feature:` | New features (e.g., `feature: added bar chart`) |
| `refactor:` | Code restructuring (e.g., `refactor: cleaned up worker logic`) |
| `docs:`    | Documentation changes             |
| `style:`   | Formatting, whitespace, no code change |
| `test:`    | Adding or updating tests          |
| `chore:`   | Build process, dependencies, etc.  |

Examples:

```bash
fix: printer button not working
feature: added bar chart report
refactor: simplified IPC handler structure
docs: updated architecture diagram
```

## Key files to edit

| File              | What to change                         |
|-------------------|----------------------------------------|
| `bypass.js`       | Scan rules, keywords, output format    |
| `ipcHandlers.js`  | IPC handlers, worker management, report windows |
| `index.js`        | UI state, progress management, IPC     |
| `main.js`         | Window creation, app lifecycle         |
| `AGENTS.md`       | This guide — keep updated after changes |
| `README.md`       | User-facing documentation               |
