/**
 * Electron preload script.
 * Exposes the `electronAPI` interface on the window object via contextBridge,
 * providing IPC communication channels between the renderer and main process.
 * @module preload/preload
 */
'use strict';

const { contextBridge, ipcRenderer } = require('electron/renderer');

/**
 * Electron API interface exposed to the renderer process.
 */
contextBridge.exposeInMainWorld('electronAPI', {
    /**
     * Opens a file picker dialog to select an L5X file.
     * @function selectFile
     * @returns {Promise<string>} The selected file path.
     */
    selectFile: () => ipcRenderer.invoke('select-file'),

    /**
     * Clears the currently selected file.
     * @function clearFile
     * @returns {Promise<void>}
     */
    clearFile: () => ipcRenderer.invoke('clear-file'),

    /**
     * Initiates a scan on the selected L5X file.
     * @function startScan
     * @param {Object} data - Scan configuration object (keywords, checkboxes).
     * @returns {Promise<void>}
     */
    startScan: (data) => ipcRenderer.invoke('start-scan', data),

    /**
     * Cancels the running scan operation.
     * @function cancelScan
     * @returns {Promise<void>}
     */
    cancelScan: () => ipcRenderer.invoke('cancel-scan'),

    /**
     * Opens the report window with the scan results.
     * @function openReport
     * @param {Object} data - Report data (file path, scan results).
     * @returns {Promise<void>}
     */
    openReport: (data) => ipcRenderer.invoke('open-report', data),

    /**
     * Registers a listener for scan progress events.
     * @function onProgress
     * @param {Function} callback - Callback invoked with progress data.
     * @returns {Function} Unsubscribe function.
     */
    onProgress: (callback) => {
        const subscription = (event, ...args) => callback(...args);
        ipcRenderer.on('scan-progress', subscription);
        return () => ipcRenderer.removeListener('scan-progress', subscription);
    },

    /**
     * Registers a listener for scan completion events.
     * @function onComplete
     * @param {Function} callback - Callback invoked with completion data.
     * @returns {Function} Unsubscribe function.
     */
    onComplete: (callback) => {
        const subscription = (event, ...args) => callback(...args);
        ipcRenderer.on('scan-complete', subscription);
        return () => ipcRenderer.removeListener('scan-complete', subscription);
    },

    /**
     * Registers a listener for report data events.
     * @function onReportData
     * @param {Function} callback - Callback invoked with report data.
     * @returns {Function} Unsubscribe function.
     */
    onReportData: (callback) => {
        const subscription = (event, ...args) => callback(...args);
        ipcRenderer.on('report-data', subscription);
        return () => ipcRenderer.removeListener('report-data', subscription);
    },

    /**
     * Triggers PDF generation/printing of the report.
     * @function printPdf
     * @returns {Promise<void>}
     */
    printPdf: () => ipcRenderer.invoke('print-pdf'),

    /**
     * Opens the GitHub repository link.
     * @function gotoGithub
     * @returns {Promise<void>}
     */
    gotoGithub: () => ipcRenderer.invoke('gotoGithub'),

    /**
     * Removes all listeners for the specified IPC channel.
     * @function removeAllListeners
     * @param {string} channel - The IPC channel name.
     * @returns {void}
     */
    removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
});
