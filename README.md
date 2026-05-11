# L5XReport

Electron app that scans **L5X files** (Rockwell/Allen-Bradley Logix controller XML backups) to detect bypass conditions in ladder logic, then generates an audit report.

## Features

- Select L5X controller backup files via file picker
- Scan ladder logic for bypass patterns (Branch, AFI, NOP, Custom Bit)
- Generate Excel audit report with detected bypass conditions
- Print PDF report from results

## Installation

```bash
npm install
```

## Usage

```bash
npm start
```

## Testing

```bash
npm run test
```

## Architecture

- **`src/main/main.js`** — Electron main process. Creates `BrowserWindow`, sets up app lifecycle events, registers IPC handlers.
- **`src/main/ipcHandlers.js`** — IPC handlers module. Wires all IPC events: `select-file`, `clear-file`, `start-scan`, `cancel-scan`, `open-report`, `print-pdf`.
- **`src/main/bypass.js`** — Worker script (runs in a separate thread). Parses L5X XML with Cheerio, iterates Routines→Rungs, matches bypass patterns.
- **`src/preload/preload.js`** — Exposes `ipcRenderer` as `window.ipc`.
- **`src/assets/js/index.js`** — Renderer logic. Manages UI state, section navigation, IPC event listeners, and progress bar.
- **`src/assets/js/report.js`** — Report rendering logic.

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
| ROUTINE | Routine name |
| RUNG | Rung number |
| COMMENT | Rung comment text |
| LEVEL | Program class |
| BY-PASS | Comma-separated bypass types |
| BACKUP | Last edit date |
| AUDIT. DATA | Current timestamp |

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| electron | ^42.0.0 | Framework |
| cheerio | ^1.2.0 | XML parsing |

## Project Structure

```
src/main/main.js          Electron main process
src/main/ipcHandlers.js   IPC handlers
src/main/bypass.js        Worker script — L5X scan engine
src/preload/preload.js    Electron preload
src/renderer/index.html   Main UI markup
src/renderer/report.html  Report UI markup
src/assets/js/index.js    Renderer logic
src/assets/js/report.js   Report rendering logic
src/assets/css/index.css  Main stylesheet
src/assets/css/report.css Report stylesheet
__TEST/*.L5X              Sample controller backup files
__TEST/bypass.unit.test.js Unit tests
```

## License

See [LICENSE](LICENSE)

## Repository

https://github.com/xpecex/L5XReport.git
