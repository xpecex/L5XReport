/**
 * Renderer logic for the main UI (3-section workflow).
 * Manages file selection, scan configuration, progress tracking,
 * IPC event listeners, and navigation between sections.
 */
'use strict';

/**
 * Main renderer script for the L5XReport application.
 * Manages the 3-section UI navigation, file selection, scan configuration,
 * progress tracking, and IPC event listeners that drive the scan workflow.
 * @module assets/js/index
 */

const ipc = window.electronAPI;

/** Application state variables. Tracks selected file, scan results, and event handlers. */
let filePath = '';
/** Path to the generated report file. */
let reportPath = '';
/** Array of scan results returned from the worker. */
let scanResults = [];
/** Total number of routines scanned. */
let totalRoutines = 0;
/** Total number of programs scanned. */
let totalPrograms = 0;
/** Active `scan-progress` event handler callback. */
let progressHandler = null;
/** Active `scan-complete` event handler callback. */
let completeHandler = null;

// DOM refs
/**
 * Query selector helper.
 * @function $
 * @param {string} sel - CSS selector.
 * @returns {HTMLElement|null}
 */
const $ = (sel) => document.querySelector(sel);

/**
 * Query selector all helper.
 * @function $$
 * @param {string} sel - CSS selector.
 * @returns {NodeList}
 */
const $$ = (sel) => document.querySelectorAll(sel);

// DOM refs — cached references to key UI elements used throughout the renderer.
/** Clickable drop zone area that triggers file selection. */
const fileDropZone = $('#file-drop-zone');
/** Element displaying the selected file path. */
const filePathEl = $('#file-path');
/** Visual icon indicating file selection state. */
const fileIcon = $('#file-icon');
/** Button triggering file selection via IPC. */
const btnSelectFile = $('#btn-select-file');
/** Button clearing the selected file state. */
const btnClearFile = $('#btn-clear-file');
/** Button navigating from section 1 to section 2. */
const btnNext1 = $('#btn-next-1');
/** Textarea for custom bypass keywords (one per line). */
const bypassInput = $('#bypass-input');
/** Checkbox enabling AFI bypass detection. */
const chkAfi = $('#chk-afi');
/** Checkbox enabling branch bypass detection. */
const chkBranch = $('#chk-branch');
/** Checkbox enabling NOP bypass detection. */
const chkNop = $('#chk-nop');
/** Button navigating from section 2 back to section 1. */
const btnBack2 = $('#btn-back-2');
/** Button initiating the scan workflow. */
const btnStartScan = $('#btn-start-scan');
/** Progress bar fill element (width controlled by setProgress). */
const progressFill = $('#progress-fill');
/** Element displaying the scan progress percentage. */
const progressPercent = $('#progress-percent');
/** Element displaying the routine counter and current routine label. */
const progressCounter = $('#progress-counter');
/** Button cancelling an active scan. */
const btnCancelScan = $('#btn-cancel-scan');
/** Button opening the generated report. */
const btnOpenReport = $('#btn-open-report');
/** Button navigating from section 3 back to section 2. */
const btnBack3 = $('#btn-back-3');
/** Link/button opening the GitHub repository. */
const gotoGithub = $('#gotoGithub');

// Navigation
/**
 * Switch the active UI section and update step indicators.
 * @function showSection
 * @param {number} n - Section number (1, 2, or 3).
 */
function showSection(n) {
    $$('[data-section]').forEach(s => s.classList.remove('active'));
    $(`[data-section="${n}"]`).classList.add('active');
    updateIndicators(n);
    window.scrollTo(0, 0);
}

/**
 * Update step indicators to reflect the current section.
 * Sets completed (✓), active (number), or pending (number) states.
 * @function updateIndicators
 * @param {number} current - The active section number (1, 2, or 3).
 */
function updateIndicators(current) {
    for (let i = 1; i <= 3; i++) {
        const el = $(`#step-${i}-indicator`);
        el.className = 'w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold';
        if (i < current) {
            el.classList.add('step-done');
            el.innerHTML = '✓';
        } else if (i === current) {
            el.classList.add('step-active');
            el.innerHTML = i;
        } else {
            el.classList.add('step-pending');
            el.innerHTML = i;
        }
    }
}

// Config
/**
 * Build the scan configuration object from current UI state.
 * Parses custom keywords from the textarea, reads checkbox states.
 * @function getConfig
 * @returns {Object} Scan configuration object.
 * @returns {string[]} returns.keywords - Trimmed custom keywords.
 * @returns {boolean} returns.afi - AFI detection enabled.
 * @returns {boolean} returns.branch - Branch detection enabled.
 * @returns {boolean} returns.nop - NOP detection enabled.
 */
function getConfig() {
    return {
        keywords: bypassInput.value.split('\n').map(l => l.trim()).filter(Boolean),
        afi: chkAfi.checked,
        branch: chkBranch.checked,
        nop: chkNop.checked
    };
}

/**
 * Enable or disable the Start Scan button based on section 2 configuration.
 * The button is enabled when at least one bypass type is configured.
 * @function validateSection2
 */
function validateSection2() {
    const hasBits = bypassInput.value.trim().length > 0;
    const hasCheck = chkAfi.checked || chkBranch.checked || chkNop.checked;
    if (hasBits || hasCheck) {
        btnStartScan.disabled = false;
    } else {
        btnStartScan.disabled = true;
    }
}

/**
 * Update the progress bar UI to reflect scan progress.
 * Controls bar width, percentage text, routine counter, and color.
 * @function setProgress
 * @param {number} current - Current progress count.
 * @param {number} total - Total count.
 * @param {string} label - Status label (e.g., 'Aguardando...', routine name, 'Concluído').
 */
function setProgress(current, total, label) {
    const pct = total > 0 ? Math.round((current / total) * 100) : 0;
    progressFill.style.width = pct + '%';
    progressPercent.textContent = pct + '%';
    if (pct >= 100) {
        progressFill.style.backgroundColor = 'oklch(70.4% 0.156 152.52)';
        progressFill.style.boxShadow = 'none';
    } else {
        progressFill.style.backgroundColor = 'var(--color-indigo-500)';
        progressFill.style.boxShadow = '0 0 12px rgba(99,102,241,0.4)';
    }
    progressCounter.textContent = total > 0 ? `${current} de ${total} — ${label}` : `${current} de ${total}`;
}

// File selection
/**
 * Handle file selection via IPC. Updates UI state when a file is chosen.
 */
btnSelectFile.addEventListener('click', async () => {
    const result = await ipc.selectFile();
    if (result && result.filePath) {
        filePath = result.filePath;
        reportPath = result.reportPath || '';
        filePathEl.textContent = filePath;
        fileIcon.classList.replace('bg-slate-800', 'bg-indigo-600/10');
        btnClearFile.classList.remove('hidden');
        btnNext1.disabled = false;
    }
});

/** Click the drop zone to trigger file selection. */
fileDropZone.addEventListener('click', () => btnSelectFile.click());
/** Allow Enter key on the drop zone to trigger file selection. */
fileDropZone.addEventListener('keydown', (e) => { if (e.key === 'Enter') btnSelectFile.click(); });

/**
 * Handle clearing the selected file. Resets all file-related UI state.
 */
btnClearFile.addEventListener('click', () => {
    filePath = '';
    reportPath = '';
    filePathEl.textContent = 'Nenhum arquivo selecionado';
    fileIcon.classList.replace('bg-indigo-600/10', 'bg-slate-800');
    btnClearFile.classList.add('hidden');
    btnNext1.disabled = true;
});

/** Navigate from section 1 (file selection) to section 2 (configuration). */
btnNext1.addEventListener('click', () => showSection(2));

// Section 2
/** Validate section 2 config when any checkbox changes. */
[chkAfi, chkBranch, chkNop].forEach(chk => chk.addEventListener('change', validateSection2));
/** Validate section 2 config when custom keywords input changes. */
bypassInput.addEventListener('input', validateSection2);
/** Navigate from section 2 back to section 1. */
btnBack2.addEventListener('click', () => showSection(1));

// Scan
/**
 * Handle scan initiation: reset state, register IPC listeners, start scan.
 * Removes old listeners before registering new ones to avoid duplicates.
 */
btnStartScan.addEventListener('click', async () => {
    totalRoutines = 0;
    setProgress(0, 0, 'Aguardando...');
    showSection(3);

    btnCancelScan.classList.remove('hidden');
    btnOpenReport.classList.add('hidden');
    progressFill.style.width = '0%';
    progressFill.style.backgroundColor = 'var(--color-indigo-500)';
    progressFill.style.boxShadow = '0 0 12px rgba(99,102,241,0.4)';

    const scanConfig = getConfig();

    // Remove old listeners
    if (progressHandler) ipc.removeAllListeners('scan-progress');
    if (completeHandler) ipc.removeAllListeners('scan-complete');

    /**
     * `scan-progress` handler — updates progress bar with current routine.
     * @param {Object} data - Progress data from worker.
     * @param {number} data.current - Current rung number.
     * @param {number} data.total - Total routines to scan.
     * @param {string} data.lastRoutine - Name of the routine being scanned.
     */
    progressHandler = (data) => {
        totalRoutines = data.total;
        setProgress(data.current, data.total, data.lastRoutine || '');
    };

    /**
     * `scan-complete` handler — stores results, shows report button.
     * @param {Object} data - Complete data from worker.
     * @param {Array} data.results - Scan results array.
     * @param {string} data.reportPath - Path to the generated report.
     * @param {number} data.totalPrograms - Total programs scanned.
     */
    completeHandler = (data) => {
        console.log(data);
        setProgress(totalRoutines, totalRoutines, 'Concluído');
        reportPath = data.reportPath || filePath;
        scanResults = data.results || [];
        totalPrograms = data.totalPrograms || 0;
        btnCancelScan.classList.add('hidden');

        if (scanResults.length > 0) {
            btnOpenReport.classList.remove('hidden');
        } else {
            btnOpenReport.classList.add('hidden');
        }
    };

    ipc.onProgress(progressHandler);
    ipc.onComplete(completeHandler);

    try {
        await ipc.startScan({ filePath, scanConfig });
    } catch (err) {
        setProgress(0, totalRoutines, 'Erro');
        btnCancelScan.classList.add('hidden');
        btnOpenReport.classList.add('hidden');
    }
});

/**
 * Handle scan cancellation via IPC.
 */
btnCancelScan.addEventListener('click', async () => {
    await ipc.cancelScan();
});

/**
 * Handle opening the report window. Sends scan results and metadata via IPC.
 */
btnOpenReport.addEventListener('click', async () => {
    await ipc.openReport({ results: scanResults, totalRoutines, totalPrograms, reportPath, filePath });
});

/** Navigate from section 3 (progress) back to section 2 (configuration). */
btnBack3.addEventListener('click', () => showSection(2));

/**
 * Handle opening the GitHub repository link via IPC.
 */
gotoGithub.addEventListener('click', async () => {
    await ipc.gotoGithub();
});

// Init
validateSection2();
