'use strict';

const { ipcMain, dialog, BrowserWindow } = require('electron/main');

let activeWorker = null;
let reportPath = null;

const registerIpcHandlers = (mainWindow) => {

    // ============================================================
    // File Selection
    // ============================================================

    ipcMain.handle('select-file', async () => {

        const path = require('node:path');

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

    ipcMain.handle('clear-file', () => {
        reportPath = null;
        return { success: true };
    });

    // ============================================================
    // Scan Management
    // ============================================================

    ipcMain.handle('start-scan', async (event, { filePath, scanConfig }) => {
        if (activeWorker) {
            activeWorker.terminate();
            activeWorker = null;
        }

        const webContents = event.sender;

        return new Promise((resolve, reject) => {

            const path = require('node:path');
            const { Worker } = require('node:worker_threads');

            activeWorker = new Worker(path.resolve('src/main', 'bypass.js'), {
                workerData: { filepath: filePath, CONFIG: scanConfig }
            });

            activeWorker.on('message', (message) => {
                switch (message.type) {
                    case 'PROGRESS':
                        webContents.send('scan-progress', message.payload);
                        break;
                    case 'SUCCESS':
                        activeWorker = null;
                        webContents.send('scan-complete', {
                            results: message.payload.results,
                            totalRoutines: message.payload.totalRoutinesScanned,
                            totalPrograms: message.payload.totalPrograms,
                            reportPath, filePath
                        });
                        resolve({ totalRungs: message.payload.results.length, reportPath });
                        break;
                    case 'ERROR':
                        activeWorker = null;
                        webContents.send('scan-cancelled', message.payload);
                        reject(message.payload);
                        break;
                }
            });

            activeWorker.on('error', (e) => {
                webContents.send('scan-cancelled', e);
                reject(e);
            });
            activeWorker.on('exit', (code) => {
                if (code !== 0 && !activeWorker) reject(new Error(`Worker terminated with code ${code}`));
            });
        });
    });

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

    // ============================================================
    // Report Management
    // ============================================================

    ipcMain.handle('open-report', (event, { results, totalRoutines, totalPrograms, reportPath, filePath }) => {
        if (!results || results.length === 0) {
            return { success: false };
        }

        const path = require('node:path');
        const reportWindow = new BrowserWindow({
            width: 1200,
            height: 900,
            webPreferences: {
                preload: path.resolve('src/preload', 'preload.js'),
                contextIsolation: false,
                nodeIntegration: true
            }
        });

        reportWindow.webContents.on('before-input-event', (event, input) => {
            if (input.type === 'keyDown' && input.key === 'F12') {
                reportWindow.webContents.toggleDevTools();
            }
        });

        reportWindow.removeMenu();
        reportWindow.loadFile(path.resolve('src/renderer', 'report.html'));

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

    ipcMain.handle('print-pdf', async (event) => {
        const reportWin = BrowserWindow.fromWebContents(event.sender);
        if (!reportWin) return { success: false };

        const now = new Date().toISOString().replace(/(-|:|\.|Z)/g, '').replace('T', '_');
        const path = require('node:path');

        const { canceled, filePath } = await dialog.showSaveDialog(reportWin, {
            title: 'Salvar Relatório PDF',
            defaultPath: `L5XReport_${now}.pdf`,
            filters: [
                { name: 'PDF Files', extensions: ['pdf'] },
                { name: 'All Files', extensions: ['*'] }
            ]
        });

        if (canceled || !filePath) return { success: false };

        try {
            const pdfBuffer = await reportWin.webContents.printToPDF({
                pageSize: 'A4',
                printBackground: true,
                preferCSSPageSize: true,
                margin: { top: 0, bottom: 0, left: 0, right: 0 }
            });
            const fs = require('node:fs');
            fs.writeFileSync(filePath, pdfBuffer);
            return { success: true, filePath };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

};

module.exports = { registerIpcHandlers, getActiveWorker: () => activeWorker, setActiveWorker: (w) => { activeWorker = w; }, getReportPath: () => reportPath };
