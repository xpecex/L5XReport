/**
 * IPC handlers module for the Electron main process.
 * Registers all IPC event listeners between main and renderer processes,
 * manages the worker thread lifecycle, and handles file/dialog operations.
 * @module main/ipcHandlers
 */
'use strict';

const { app, ipcMain, dialog, BrowserWindow } = require('electron/main');
const { Worker } = require('node:worker_threads');
const { shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

let activeWorker = null;
let reportPath = null;

/**
 * Registers all IPC handlers between the main and renderer processes.
 * @function registerIpcHandlers
 * @param {BrowserWindow} mainWindow - The primary application window.
 */
const registerIpcHandlers = (mainWindow) => {

    const workerPath = app.isPackaged ? path.join(app.getAppPath(), 'src/main/bypass.js') : path.resolve('src/main', 'bypass.js');

    // ============================================================
    // File Selection
    // ============================================================

    /**
     * Opens a file picker dialog to select an L5X file.
     * In E2E_TEST mode, uses the built-in test file instead of a dialog.
     * @function ipcMain.handle select-file
     * @returns {Promise<Object>} Object with `filePath` and `reportPath`.
     */
    ipcMain.handle('select-file', async () => {


        if (process.env.E2E_TEST === 'true') {
            const filePath = path.resolve('__TEST', 'ProjectTest.L5X');
            const filename = path.basename(filePath, '.L5X');
            reportPath = path.join(path.dirname(filePath), `${filename}_BypassReport.xlsx`);
            return { filePath, reportPath };
        }

        const result = await dialog.showOpenDialog(mainWindow, {
            title: 'Selecionar Arquivo L5X',
            filters: [
                { name: 'L5X Files', extensions: ['L5X'] },
                { name: 'All Files', extensions: ['*'] }
            ],
            properties: ['openFile']
        });

        if (result.canceled || result.filePaths.length === 0) {
            return { filePath: null };
        }

        const filePath = result.filePaths[0];
        const filename = path.basename(filePath, '.L5X');
        reportPath = path.join(path.dirname(filePath), `${filename}_BypassReport.xlsx`);
        return { filePath, reportPath };
    });

    /**
     * Clears the currently selected file and resets reportPath.
     * @function ipcMain.handle clear-file
     * @returns {Promise<Object>} Object with `success: true`.
     */
    ipcMain.handle('clear-file', () => {
        reportPath = null;
        return { success: true };
    });

    // ============================================================
    // Scan Management
    // ============================================================

    /**
     * Initiates a scan on the selected L5X file using a worker thread.
     * Creates a new `Worker` with the file path and scan config, forwards
     * PROGRESS/SUCCESS/ERROR messages to the main window, and resolves/rejects
     * a promise based on the worker outcome. Cancels any prior active worker.
     * @function ipcMain.handle start-scan
     * @param {Event} event - IPC event with sender webContents.
     * @param {Object} data - Contains `filePath` and `scanConfig`.
     * @returns {Promise<Object>} Resolves with `totalRungs` and `reportPath`.
     */
    ipcMain.handle('start-scan', async (event, { filePath, scanConfig }) => {
        if (activeWorker) {
            activeWorker.terminate();
            activeWorker = null;
        }

        const webContents = event.sender;

        return new Promise((resolve, reject) => {

            activeWorker = new Worker(workerPath, {
                workerData: { filepath: filePath, CONFIG: scanConfig }
            });

            activeWorker.on('message', (message) => {
                switch (message.type) {
                    case 'PROGRESS':
                        mainWindow.webContents.send('scan-progress', message.payload);
                        break;
                    case 'SUCCESS':
                        activeWorker = null;
                        mainWindow.webContents.send('scan-complete', {
                            results: message.payload.results,
                            totalRoutines: message.payload.totalRoutinesScanned,
                            totalPrograms: message.payload.totalPrograms,
                            reportPath, filePath
                        });
                        resolve({ totalRungs: message.payload.results.length, reportPath });
                        break;
                    case 'ERROR':
                        activeWorker = null;
                        mainWindow.webContents.send('scan-cancelled', message.payload);
                        reject(message.payload);
                        break;
                }
            });

            activeWorker.on('error', (e) => {
                mainWindow.webContents.send('scan-cancelled', e);
                reject(e);
            });
            activeWorker.on('exit', (code) => {
                if (code !== 0 && !activeWorker) reject(new Error(`Worker terminated with code ${code}`));
            });
        });
    });

    /**
     * Cancels the running scan by terminating the active worker thread.
     * Sends a `scan-cancelled` event to the main window.
     * @function ipcMain.handle cancel-scan
     * @returns {Promise<Object>} Object with `success: true` or `success: false`.
     */
    ipcMain.handle('cancel-scan', () => {
        if (activeWorker) {
            activeWorker.terminate();
            activeWorker = null;
            if (mainWindow) {
                mainWindow.webContents.send('scan-cancelled');
            }
            return { success: true };
        }
        return { success: false };
    });

    /**
     * Opens the GitHub repository URL in the default browser.
     * @function ipcMain.handle gotoGithub
     * @returns {Promise<void>}
     */
    ipcMain.handle('gotoGithub', async () => {
        await shell.openExternal("https://github.com/xpecex/L5XReport");
    });

    // ============================================================
    // Report Management
    // ============================================================

    /**
     * Opens a new BrowserWindow for the scan report.
     * Loads `report.html`, sends report data on finish, and returns success.
     * @function ipcMain.handle open-report
     * @param {Event} event - IPC event.
     * @param {Object} data - Contains `results`, `totalRoutines`, `totalPrograms`, `reportPath`, `filePath`.
     * @returns {Promise<Object>} Object with `success: true` or `success: false`.
     */
    ipcMain.handle('open-report', (event, { results, totalRoutines, totalPrograms, reportPath, filePath }) => {
        if (!results || results.length === 0) {
            return { success: false };
        }

        const reportWindow = new BrowserWindow({
            width: 1200,
            height: 900,
            webPreferences: {
                preload: app.isPackaged ? path.join(app.getAppPath(), 'src/preload/preload.js') : path.resolve('src/preload', 'preload.js'),
                contextIsolation: true,
                nodeIntegration: false
            }
        });

        reportWindow.removeMenu();
        reportWindow.loadFile(app.isPackaged ? path.join(app.getAppPath(), 'src/renderer/report.html') : path.resolve('src/renderer', 'report.html'));

        reportWindow.webContents.on('did-finish-load', () => {
            reportWindow.webContents.send('report-data', {
                results,
                totalRoutines,
                totalPrograms,
                reportPath,
                filePath
            });
        });

        return { success: true };
    });

    /**
     * Generates and saves a PDF of the report window.
     * In E2E_TEST mode, saves to a test directory with a timestamped filename.
     * Otherwise opens a save dialog to let the user choose the path.
     * @function ipcMain.handle print-pdf
     * @param {Event} event - IPC event with sender webContents.
     * @returns {Promise<Object>} Object with `success`, `filePath` (or `error` on failure).
     */
    ipcMain.handle('print-pdf', async (event) => {
        const reportWin = BrowserWindow.fromWebContents(event.sender);
        if (!reportWin) return { success: false };

        const now = new Date().toISOString().replace(/(-|:|\.|Z)/g, '').replace('T', '_');

        let filePath;
        if (process.env.E2E_TEST === 'true') {
            filePath = path.resolve('__TEST', `L5XReport_${now}.pdf`);
        } else {
            const { canceled, filePath: savePath } = await dialog.showSaveDialog(reportWin, {
                title: 'Salvar Relatório PDF',
                defaultPath: `L5XReport_${now}.pdf`,
                filters: [
                    { name: 'PDF Files', extensions: ['pdf'] },
                    { name: 'All Files', extensions: ['*'] }
                ]
            });

            if (canceled || !savePath) return { success: false };
            filePath = savePath;
        }

        try {
            const pdfBuffer = await reportWin.webContents.printToPDF({
                pageSize: 'A4',
                printBackground: true,
                preferCSSPageSize: true,
                margin: { top: 0, bottom: 0, left: 0, right: 0 }
            });
            fs.writeFileSync(filePath, pdfBuffer);
            return { success: true, filePath };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

};

/**
 * Exports module API.
 * @module main/ipcHandlers
 */
module.exports = {
    /**
     * Registers all IPC handlers between main and renderer processes.
     * @function registerIpcHandlers
     * @param {BrowserWindow} mainWindow
     */
    registerIpcHandlers,

    /**
     * Returns the currently active worker thread.
     * @function getActiveWorker
     * @returns {Worker|null}
     */
    getActiveWorker: () => activeWorker,

    /**
     * Sets the active worker thread.
     * @function setActiveWorker
     * @param {Worker|null} w
     */
    setActiveWorker: (w) => { activeWorker = w; },

    /**
     * Returns the path to the generated report file.
     * @function getReportPath
     * @returns {string|null}
     */
    getReportPath: () => reportPath
};
