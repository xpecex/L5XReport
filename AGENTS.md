# L5XReport — Agent Guide

## Project

Electron app that scans **L5X files** (Rockwell/Allen-Bradley Logix controller XML backups) to detect bypass conditions in ladder logic, then generates an audit report.

---

## Commands

```bash
npm install              # Install dependencies
npm start                # Launch Electron app
npm run test        # Run unit tests for scanner output validation
```

---

## Structure

```
src/main/main.js          Electron main process — creates window, app lifecycle, registers IPC handlers
src/main/ipcHandlers.js   IPC handlers — select-file, start-scan, cancel-scan, open-report, print-pdf
src/main/bypass.js        Worker script — parses L5X XML, scans for bypass patterns
src/preload/preload.js    Electron preload — exposes ipcRenderer to renderer
src/renderer/index.html   Renderer page — UI markup only
src/assets/js/index.js    Renderer logic — UI state, IPC handlers, progress management
src/shared/               Empty — intended for shared utilities
src/assets/               Static assets (JS, images, etc.)
__TEST/*.L5X              Sample controller backup files
__TEST/bypass.unit.test.js Unit tests — validates scanner output structure and values
```

---

## Architecture

- `main.js` — Electron main process. Creates `BrowserWindow`, sets up app lifecycle events (`ready`, `activate`, `window-all-closed`), and registers `ipcHandlers.js`.
- `ipcHandlers.js` — IPC handlers module. Exports `registerIpcHandlers(mainWindow)` which wires all IPC events: `select-file`, `clear-file`, `start-scan`, `cancel-scan`, `open-report`, `print-pdf`. Manages `activeWorker` and `reportPath` state.
- `bypass.js` — Worker script (runs in a separate thread). Receives `filepath` and `CONFIG` via `workerData`. Parses L5X XML with Cheerio, iterates Routines→Rungs, matches bypass patterns, posts `PROGRESS`/`SUCCESS`/`ERROR` messages to the main thread.
- `renderer.js` (in `src/assets/js/`) — Renderer logic. Manages UI state, section navigation, IPC event listeners (`scan-progress`, `scan-complete`, `scan-cancelled`), and controls the progress bar/report button.
- `preload.js` — Exposes `ipcRenderer` as `window.ipc`.
- `ipcHandlers.js` writes the Excel report using `xlsx` directly when the worker posts `SUCCESS`.

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
| `package.json`    | Dependencies, entry point              |
