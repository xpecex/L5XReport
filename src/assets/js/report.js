/**
 * Report renderer script for the L5XReport application.
 * Renders the audit report UI: pie charts, detailed results table, header
 * metadata, and footer with file info. Listens for `report-data` IPC events.
 * @module assets/js/report
 */
'use strict';

const ipc = window.electronAPI;

/** Data object received from the main process via `report-data` IPC event. */
let reportData = null;

// DOM helpers
/**
 * Query selector helper.
 * @function $
 * @param {string} sel - CSS selector.
 * @returns {HTMLElement|null}
 */
const $ = (sel) => document.querySelector(sel);

// Level classification: "Safety" = safety, anything else = standard
/**
 * Check if a level string contains "Safety" (case-insensitive).
 * @function isSafety
 * @param {string} level - Program class level string.
 * @returns {boolean} True if the level is classified as safety.
 */
function isSafety(level) {
    return /Safety/i.test(level);
}

/**
 * Format a date string to Brazilian locale short date.
 * @function formatDateTime
 * @param {string} dateStr - ISO date string from the L5X backup.
 * @returns {string} Formatted date (`pt-BR` locale) or original string if invalid.
 */
function formatDateTime(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('pt-BR');
}

/**
 * Format a date string to Brazilian locale date-time.
 * @function formatAuditDateTime
 * @param {string} dateStr - ISO date string from the audit timestamp.
 * @returns {string} Formatted date-time (`pt-BR` locale) or original string if invalid.
 */
function formatAuditDateTime(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleString('pt-BR');
}

/**
 * Render a level badge element as HTML string.
 * Returns a "Safety" or "Standard" badge with shared styling.
 * @function renderLevelBadge
 * @param {string} level - Program class level string.
 * @returns {string} HTML span with level badge class and label.
 */
function renderLevelBadge(level) {
    const safety = isSafety(level);
    const label = safety ? 'Safety' : 'Standard';
    const bgClass = safety ? 'bg-white/20 text-slate-900' : 'bg-white/20 text-slate-900';
    return `<span class="px-2 py-0.5 rounded-full ${bgClass} font-bold">${label}</span>`;
}

/**
 * Render a bypass badge element as HTML string.
 * Bit bypasses ("BIT:") are yellow; others are red.
 * @function renderBypassBadge
 * @param {string} bypassStr - Comma-separated bypass types string.
 * @returns {string} HTML string with colored span elements, or empty string.
 */
function renderBypassBadge(bypassStr) {
    if (!bypassStr) return '';
    const parts = bypassStr.split(',').map(s => s.trim());
    return parts.map(p => {
        const isBit = p.startsWith('BIT:');
        const color = isBit ? 'text-yellow-300' : 'text-red-300';
        return `<span class="${color} font-black italic">${p}</span>`;
    }).join(', ');
}

/**
 * Calculate SVG stroke-dash values for the level distribution pie chart.
 * @function renderPieChart
 * @param {Object} levelCounts - Distribution counts.
 * @param {number} levelCounts.standard - Standard bypass count.
 * @param {number} levelCounts.safety - Safety bypass count.
 * @returns {Object} SVG chart configuration.
 * @returns {string} returns.dashA - Standard circle stroke-dasharray.
 * @returns {string} returns.dashB - Safety circle stroke-dasharray.
 * @returns {string} returns.offsetB - Safety circle stroke-dashoffset.
 * @returns {number} returns.pctA - Standard percentage.
 * @returns {number} returns.pctB - Safety percentage.
 */
function renderPieChart(levelCounts) {
    const total = levelCounts.standard + levelCounts.safety;
    if (total === 0) {
        let res = { dashA: '0 251', dashB: '0 251', offsetB: '-0', pctA: 0, pctB: 0 };
        return res;
    }
    const circumference = 251;
    const safetyPct = (levelCounts.safety / total) * 100;
    const standardPct = (levelCounts.standard / total) * 100;
    const safetyDash = ((safetyPct / 100) * circumference).toFixed(2);
    const standardDash = ((standardPct / 100) * circumference).toFixed(2);
    let res = {
        dashA: `${standardDash} ${circumference}`,
        dashB: `${safetyDash} ${circumference}`,
        offsetB: `-${standardDash}`,
        pctA: (standardPct).toFixed(2),
        pctB: (safetyPct).toFixed(2)
    };
    return res;
}

/**
 * Render the full audit report UI from report data.
 * Updates header, totals, dates, both pie charts, results table, and footer.
 * @function render
 * @param {Object} reportData - The report data object (from `onReportData` IPC event).
 */
function render() {
    if (!reportData) return;

    const { results, totalRoutines, totalPrograms, reportPath, filePath } = reportData;

    // Header: controller name from first result
    const controller = results.length > 0 ? results[0]['CONTROLLER'] : '<N/A>';
    $('h2').textContent = controller;

    // Totals
    const totalProgramsEl = document.querySelector('.text-right .flex span:first-of-type span');
    if (totalProgramsEl) totalProgramsEl.textContent = totalPrograms;
    const totalRoutinesEl = document.querySelector('.text-right .flex span:nth-of-type(2) span');
    if (totalRoutinesEl) totalRoutinesEl.textContent = totalRoutines;

    // Backup & Audit dates from first result
    const backupDate = results.length > 0 ? formatDateTime(results[0]['BACKUP']) : '';
    const auditDate = results.length > 0 ? formatAuditDateTime(results[0]['AUDIT. DATA']) : '';
    const infoBar = document.querySelector('.flex.justify-between.bg-slate-50');
    if (infoBar) {
        infoBar.innerHTML = `
            <div><span class="font-bold text-slate-500">BACKUP DATE:</span> ${backupDate}</div>
            <div><span class="font-bold text-slate-500">AUDIT DATE:</span> ${auditDate}</div>
        `;
    }

    // Pie chart: distribution by level
    let levelCounts = { standard: 0, safety: 0 };
    results.forEach(r => {
        if (isSafety(r['LEVEL'])) levelCounts.safety++;
        else levelCounts.standard++;
    });

    const pie = renderPieChart(levelCounts);
    const pieChart = document.querySelector('svg#piechart');
    if (pieChart) {
        const stdCircle = pieChart.querySelector('circle:nth-child(1)');
        const satCircle = pieChart.querySelector('circle:nth-child(2)');
        if (stdCircle) {
            stdCircle.setAttribute('stroke-dasharray', pie.dashA);
        }
        if (satCircle) {
            satCircle.setAttribute('stroke-dasharray', pie.dashB);
            satCircle.setAttribute('stroke-dashoffset', pie.offsetB);
        }
        // Update legend with percentages
        const legend = pieChart.closest('.flex-col').querySelector('.flex.gap-4');
        if (legend) {
            legend.innerHTML = `
                <div class="flex items-center"><span class="w-3 h-3 bg-[#B91C1C] mr-1 rounded-sm"></span> Safety (${pie.pctB}%)</div>
                <div class="flex items-center"><span class="w-3 h-3 bg-[#2E5A97] mr-1 rounded-sm"></span> Standard (${pie.pctA}%)</div>
            `;
        }
    }

    // Pie chart: bypass count by type
    const bypassCounts = {};
    results.forEach(r => {
        const bypassStr = r['BY-PASS'];
        if (!bypassStr) return;
        bypassStr.split(',').map(s => s.trim()).forEach(type => {
            bypassCounts[type] = (bypassCounts[type] || 0) + 1;
        });
    });

    const sortedBypasses = Object.entries(bypassCounts).sort((a, b) => b[1] - a[1]);
    const totalBypasses = sortedBypasses.reduce((sum, [, v]) => sum + v, 0);

    const bypassColors = [
        '#2E5A97', '#B91C1C', '#F59E0B', '#10B981', '#8B5CF6',
        '#EF4444', '#06B6D4', '#F97316', '#6366F1', '#14B8A6',
        '#EC4899', '#84CC16', '#D946EF', '#0EA5E9', '#A3A3A3',
        '#3B3C36', '#880085', '#FFF5EE', '#010B13', '#8ca9cd'
    ];

    /**
     * Calculate SVG path for a pie slice arc.
     * @function arcPath
     * @param {number} cx - Center X coordinate.
     * @param {number} cy - Center Y coordinate.
     * @param {number} r - Radius.
     * @param {number} startAngle - Start angle in degrees.
     * @param {number} endAngle - End angle in degrees.
     * @returns {string} SVG path `d` attribute string.
     */
    function arcPath(cx, cy, r, startAngle, endAngle) {
        const startRad = (startAngle - 90) * Math.PI / 180;
        const endRad = (endAngle - 90) * Math.PI / 180;
        const x1 = cx + r * Math.cos(startRad);
        const y1 = cy + r * Math.sin(startRad);
        const x2 = cx + r * Math.cos(endRad);
        const y2 = cy + r * Math.sin(endRad);
        const largeArc = (endAngle - startAngle) > 180 ? 1 : 0;
        return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
    }

    const bypassPieSvg = document.querySelector('svg#bypiechart');
    if (bypassPieSvg && sortedBypasses.length > 0) {
        let rebuild = '';

        let angle = 0;
        sortedBypasses.forEach(([type, count], idx) => {
            const sliceAngle = (count / totalBypasses) * 360;
            const color = bypassColors[idx % bypassColors.length];
            rebuild += `<path d="${arcPath(50, 50, 40, angle, angle + sliceAngle)}" fill="${color}" />`;
            angle += sliceAngle;
        });

        bypassPieSvg.innerHTML = rebuild;

        // Update legend
        const legend = document.getElementById('bypielegend');
        if (legend) {
            legend.innerHTML = sortedBypasses.map(([type, count], idx) => {
                const color = bypassColors[idx % bypassColors.length];
                const pct = ((count / totalBypasses) * 100).toFixed(2);
                return `<div class="flex items-center"><span class="w-3 h-3 rounded-sm mr-1" style="background-color:${color}"></span>${type} (${pct}%)</div>`;
            }).join('');
        }
    }

    // Table: detailed list
    const tbody = document.querySelector('table tbody');
    if (tbody) {
        tbody.innerHTML = results.map((r, idx) => {
            const bg = idx % 2 === 0 ? 'bg-slate-50' : 'bg-slate-200';
            const text = idx % 2 === 0 ? 'text-slate-900' : 'text-slate-900';
            return `
                <tr class="border-b border-slate-100 text-pretty ${bg} ${text}">
                    <td class="p-2 font-bold">${r['CONTROLLER']}</td>
                    <td class="p-2">${r['PROGRAM']}</td>
                    <td class="p-2 italic">${r['ROUTINE']}</td>
                    <td class="p-2 text-center font-mono">${r['RUNG']}</td>
                    <td class="p-2 text-center">${renderLevelBadge(r['LEVEL'])}</td>
                    <td class="p-2 text-center">${renderBypassBadge(r['BY-PASS'])}</td>
                    <td class="p-2 ">${r['COMMENT']}</td>
                </tr>
            `;
        }).join('');
    }

    // Footer with file info
    const footer = document.querySelector('footer');
    if (footer) {
        const fileBase = filePath ? filePath.split(/[\\/]/).pop() : '';
        footer.innerHTML = `
            <span>Generated by <a href="https://github.com/xpecex/L5XReport" target="_blank">L5XReport</a></span>
            <span>${fileBase} — ${auditDate}</span>
        `;
    }
}

// Listen for report-data from main process
/**
 * `report-data` IPC handler — stores data and triggers render.
 * @param {Object} data - Report data from the main process.
 * @param {Array} data.results - Scan results.
 * @param {number} data.totalRoutines - Total routines scanned.
 * @param {number} data.totalPrograms - Total programs scanned.
 * @param {string} data.reportPath - Report file path.
 * @param {string} data.filePath - Source L5X file path.
 */
ipc.onReportData((data) => {
    reportData = data;
    render();
});

// Print PDF handler
/**
 * Handle PDF generation — disables button during generation, shows result status.
 */
$('#btn-print').addEventListener('click', async () => {
    const btn = $('#btn-print');
    btn.disabled = true;
    btn.textContent = 'Gerando PDF...';

    const result = await ipc.printPdf();

    if (result.success) {
        btn.textContent = 'PDF Salvo!';
        setTimeout(() => { btn.textContent = 'SALVAR PDF'; btn.disabled = false; }, 2000);
    } else {
        btn.textContent = 'SALVAR PDF';
        btn.disabled = false;
        if (result.error) {
            ipc.showErrorDialog(result.error);
        }
    }
});

/**
 * Dismiss the error dialog by hiding it and clearing the message.
 */
$('#btn-dismiss-error').addEventListener('click', async () => {
    await ipc.hideErrorDialog();
});

/**
 * Close the error dialog on Escape key press.
 */
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('#error-dialog') && !$('#error-dialog').classList.contains('hidden')) {
        ipc.hideErrorDialog();
    }
});

const beforeUnloadHandler = (event) => {
    if (reportData) {
        reportData = null;
    }
};

window.addEventListener('beforeunload', beforeUnloadHandler)