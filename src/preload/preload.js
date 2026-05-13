'use strict';

const { contextBridge, ipcRenderer } = require('electron/renderer');

contextBridge.exposeInMainWorld('electronAPI', {
    selectFile: () => ipcRenderer.invoke('select-file'),
    clearFile: () => ipcRenderer.invoke('clear-file'),
    startScan: (data) => ipcRenderer.invoke('start-scan', data),
    cancelScan: () => ipcRenderer.invoke('cancel-scan'),
    openReport: (data) => ipcRenderer.invoke('open-report', data),
    onProgress: (callback) => {
        const subscription = (event, ...args) => callback(...args);
        ipcRenderer.on('scan-progress', subscription);
        return () => ipcRenderer.removeListener('scan-progress', subscription);
    },
    onComplete: (callback) => {
        const subscription = (event, ...args) => callback(...args);
        ipcRenderer.on('scan-complete', subscription);
        return () => ipcRenderer.removeListener('scan-complete', subscription);
    },
    onReportData: (callback) => {
        const subscription = (event, ...args) => callback(...args);
        ipcRenderer.on('report-data', subscription);
        return () => ipcRenderer.removeListener('report-data', subscription);
    },
    printPdf: () => ipcRenderer.invoke('print-pdf'),
    gotoGithub: () => ipcRenderer.invoke('gotoGithub'),
    removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
});
