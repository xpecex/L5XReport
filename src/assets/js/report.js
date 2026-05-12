'use strict';

const ipc = window.electronAPI;

let reportData = null;

// DOM helpers
const $ = (sel) => document.querySelector(sel);

// Level classification: "Safety" = safety, anything else = standard
function isSafety(level) {
    return /Safety/i.test(level);
}

function formatDateTime(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('pt-BR');
}

function formatAuditDateTime(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleString('pt-BR');
}

function renderLevelBadge(level) {
    const safety = isSafety(level);
    const label = safety ? 'Safety' : 'Standard';
    const bgClass = safety ? 'bg-white/20 text-slate-900' : 'bg-white/20 text-slate-900';
    return `<span class="px-2 py-0.5 rounded-full ${bgClass} font-bold">${label}</span>`;
}

function renderBypassBadge(bypassStr) {
    if (!bypassStr) return '';
    const parts = bypassStr.split(',').map(s => s.trim());
    return parts.map(p => {
        const isBit = p.startsWith('BIT:');
        const color = isBit ? 'text-yellow-300' : 'text-red-300';
        return `<span class="${color} font-black italic">${p}</span>`;
    }).join(', ');
}

function renderPieChart(levelCounts) {
    const total = levelCounts.standard + levelCounts.safety;
    if (total === 0) {
        return { dashA: '0 251', dashB: '0 251', offsetB: '-0', pctA: 0, pctB: 0 };
    }
    const circumference = 251;
    const safetyPct = (levelCounts.safety / total) * 100;
    const standardPct = (levelCounts.standard / total) * 100;
    const safetyDash = ((safetyPct / 100) * circumference).toFixed(2);
    const standardDash = ((standardPct / 100) * circumference).toFixed(2);
    return {
        dashA: `${standardDash} ${circumference}`,
        dashB: `${safetyDash} ${circumference}`,
        offsetB: `-${standardDash}`,
        pctA: (standardPct).toFixed(2),
        pctB: (safetyPct).toFixed(2)
    };
}

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
ipc.onReportData((_, data) => {
    reportData = data;
    render();
});

// Print PDF handler
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
    }
});
