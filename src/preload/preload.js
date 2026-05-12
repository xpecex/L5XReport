'use strict';

const { contextBridge, ipcRenderer } = require('electron/renderer');

contextBridge.exposeInMainWorld('electronAPI', {
    selectFile: () => ipcRenderer.invoke('select-file'),
    clearFile: () => ipcRenderer.invoke('clear-file'),
    startScan: (data) => ipcRenderer.invoke('start-scan', data),
    cancelScan: () => ipcRenderer.invoke('cancel-scan'),
    openReport: (data) => ipcRenderer.invoke('open-report', data),
    onProgress: (cb) => ipcRenderer.on('scan-progress', cb),
    onComplete: (cb) => ipcRenderer.on('scan-complete', cb),
    onReportData: (cb) => ipcRenderer.on('report-data', cb),
    printPdf: () => ipcRenderer.invoke('print-pdf'),
    removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
});
