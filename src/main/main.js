'use strict';

const { app, BrowserWindow, Menu } = require('electron/main');

let mainWindow = null;

const createWindow = () => {

    const path = require('node:path');

    mainWindow = new BrowserWindow({
        width: 800,
        height: 640,
        webPreferences: {
            preload: path.resolve('src/preload', 'preload.js'),
            contextIsolation: false,
            nodeIntegration: true
        }
    });

    mainWindow.webContents.on('before-input-event', (event, input) => {
        if (input.type === 'keyDown' && input.key === 'F12') {
            mainWindow.webContents.toggleDevTools();
        }
    });

    mainWindow.loadFile(path.resolve('src/renderer', 'index.html'));
};

app.on('ready', () => {
    Menu.setApplicationMenu(null);
});

app.whenReady().then(() => {
    createWindow();
    require('./ipcHandlers').registerIpcHandlers(mainWindow);

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    const { getActiveWorker, setActiveWorker } = require('./ipcHandlers');
    const worker = getActiveWorker();
    if (worker) {
        worker.terminate();
        setActiveWorker(null);
    }
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
