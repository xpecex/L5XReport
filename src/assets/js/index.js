'use strict';

const ipc = window.ipc;

// State
let filePath = '';
let reportPath = '';
let scanResults = [];
let totalRoutines = 0;
let totalPrograms = 0;
let progressHandler = null;
let completeHandler = null;

// DOM refs
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const fileDropZone = $('#file-drop-zone');
const filePathEl = $('#file-path');
const fileIcon = $('#file-icon');
const btnSelectFile = $('#btn-select-file');
const btnClearFile = $('#btn-clear-file');
const btnNext1 = $('#btn-next-1');
const bypassInput = $('#bypass-input');
const chkAfi = $('#chk-afi');
const chkBranch = $('#chk-branch');
const chkNop = $('#chk-nop');
const btnBack2 = $('#btn-back-2');
const btnStartScan = $('#btn-start-scan');
const progressFill = $('#progress-fill');
const progressPercent = $('#progress-percent');
const progressCounter = $('#progress-counter');
const btnCancelScan = $('#btn-cancel-scan');
const btnOpenReport = $('#btn-open-report');
const btnBack3 = $('#btn-back-3');

// Navigation
function showSection(n) {
    $$('[data-section]').forEach(s => s.classList.remove('active'));
    $(`[data-section="${n}"]`).classList.add('active');
    updateIndicators(n);
    window.scrollTo(0, 0);
}

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
function getConfig() {
    return {
        keywords: bypassInput.value.split('\n').map(l => l.trim()).filter(Boolean),
        afi: chkAfi.checked,
        branch: chkBranch.checked,
        nop: chkNop.checked
    };
}

function validateSection2() {
    const hasBits = bypassInput.value.trim().length > 0;
    const hasCheck = chkAfi.checked || chkBranch.checked || chkNop.checked;
    if (hasBits || hasCheck) {
        btnStartScan.disabled = false;
    } else {
        btnStartScan.disabled = true;
    }
}

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
btnSelectFile.addEventListener('click', async () => {
    const result = await ipc.invoke('select-file');
    if (result && result.filePath) {
        filePath = result.filePath;
        reportPath = result.reportPath || '';
        filePathEl.textContent = filePath;
        fileIcon.classList.replace('bg-slate-800', 'bg-indigo-600/10');
        btnClearFile.classList.remove('hidden');
        btnNext1.disabled = false;
    }
});

fileDropZone.addEventListener('click', () => btnSelectFile.click());
fileDropZone.addEventListener('keydown', (e) => { if (e.key === 'Enter') btnSelectFile.click(); });

btnClearFile.addEventListener('click', () => {
    filePath = '';
    reportPath = '';
    filePathEl.textContent = 'Nenhum arquivo selecionado';
    fileIcon.classList.replace('bg-indigo-600/10', 'bg-slate-800');
    btnClearFile.classList.add('hidden');
    btnNext1.disabled = true;
});

btnNext1.addEventListener('click', () => showSection(2));

// Section 2
[chkAfi, chkBranch, chkNop].forEach(chk => chk.addEventListener('change', validateSection2));
bypassInput.addEventListener('input', validateSection2);
btnBack2.addEventListener('click', () => showSection(1));

// Scan
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

    progressHandler = (_, data) => {
        totalRoutines = data.total;
        setProgress(data.current, data.total, data.lastRoutine || '');
    };

    completeHandler = (_, data) => {
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

    ipc.on('scan-progress', progressHandler);
    ipc.on('scan-complete', completeHandler);

    try {
        await ipc.invoke('start-scan', { filePath, scanConfig });
    } catch (err) {
        setProgress(0, totalRoutines, 'Erro');
        btnCancelScan.classList.add('hidden');
        btnOpenReport.classList.add('hidden');
    }
});

btnCancelScan.addEventListener('click', async () => {
    await ipc.invoke('cancel-scan');
});

btnOpenReport.addEventListener('click', async () => {
    await ipc.invoke('open-report', { results: scanResults, totalRoutines, totalPrograms, reportPath, filePath });
});

btnBack3.addEventListener('click', () => showSection(2));

// Init
validateSection2();
