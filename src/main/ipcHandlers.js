'use strict';

const { app, ipcMain, dialog, BrowserWindow } = require('electron/main');

let activeWorker = null;
let reportPath = null;

const registerIpcHandlers = (mainWindow) => {

    // ============================================================
    // File Selection
    // ============================================================

    ipcMain.handle('select-file', async () => {

        const path = require('node:path');

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

            const workerPath = app.isPackaged
                ? path.join(app.getAppPath(), 'src/main/bypass.js')
                : path.resolve('src/main', 'bypass.js');

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

    ipcMain.handle('gotoGithub', async () => {
        const { shell } = require('electron');
        await shell.openExternal("https://github.com/xpecex/L5XReport");
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
                preload: app.isPackaged ? path.join(app.getAppPath(), 'src/preload/preload.js') : path.resolve('src/preload', 'preload.js'),
                contextIsolation: true,
                nodeIntegration: false
            }
        });

        reportWindow.webContents.on('before-input-event', (event, input) => {
            if (input.type === 'keyDown' && input.key === 'F12') {
                reportWindow.webContents.toggleDevTools();
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

    ipcMain.handle('print-pdf', async (event) => {
        const reportWin = BrowserWindow.fromWebContents(event.sender);
        if (!reportWin) return { success: false };

        const now = new Date().toISOString().replace(/(-|:|\.|Z)/g, '').replace('T', '_');
        const path = require('node:path');
        const fs = require('node:fs');

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

module.exports = { registerIpcHandlers, getActiveWorker: () => activeWorker, setActiveWorker: (w) => { activeWorker = w; }, getReportPath: () => reportPath };
