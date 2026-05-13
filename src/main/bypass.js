'use strict';

const { parentPort, workerData } = require('node:worker_threads');
const cheerio = require('cheerio');
const fs = require('node:fs');
const path = require('node:path');


const L5XScanWorker = async () => {
    const { filepath, CONFIG } = workerData;

    // Configurações e Cache de Regex
    const _CONFIG = {
        keywords: CONFIG?.keywords || ['BYPASS', 'MANUT', 'MAINT', 'MANUTENCAO', 'MAINTENANCE'],
        afi: CONFIG?.afi ?? false,
        nop: CONFIG?.nop ?? false,
        branch: CONFIG?.branch ?? false,
        shortedbranchregex: /(\,+\s*\]|\,+\s*\,+|\[\s*\,)/igm
    };

    const keywordRegexCache = _CONFIG.keywords
        .filter(Boolean)
        .map(kw => ({
            name: kw,
            regex: new RegExp(`(^${kw}|_${kw}|\\(${kw})`, 'im') // Removido 'g' para evitar problemas de lastIndex no .test()
        }));

    try {
        // Carregamento do arquivo
        const file = fs.readFileSync(path.resolve(filepath), 'utf8');
        const $ = cheerio.load(file, { xmlMode: true, decodeEntities: false });

        const controller = $('Controller');
        const controllerName = controller.attr('Name') || '';
        const lastModified = controller.attr('LastModifiedDate');
        const lastEdit = lastModified ? new Date(lastModified).toLocaleDateString() : '';
        const auditDate = new Date().toLocaleString();

        const $routines = $('Routine');
        const totalRoutines = $routines.length;
        const results = [];

        for (let i = 0; i < totalRoutines; i++) {

            const routine = $routines[i];
            const $routine = $(routine);
            const routineName = $routine.attr('Name');

            if (routineName === 'Empty') continue;

            const $program = $routine.closest('Program, AddOnInstructionDefinition');
            const programName = $program.attr('Name') || 'Unknown';
            const programClass = $program.attr('Class') || '';

            const $rungs = $routine.find('Rung');

            $rungs.each((rungIdx, rung) => {
                const $rung = $(rung);
                const rungText = $rung.find('Text').text() || '';
                const bypassTypes = [];

                if (_CONFIG.branch && _CONFIG.shortedbranchregex.test(rungText)) {
                    bypassTypes.push('BRANCH');
                }
                if (_CONFIG.afi && rungText.includes('AFI')) {
                    bypassTypes.push('AFI');
                }
                if (_CONFIG.nop && rungText.includes('NOP')) {
                    bypassTypes.push('NOP');
                }

                for (const item of keywordRegexCache) {
                    if (item.regex.test(rungText)) {
                        bypassTypes.push(`${item.name}`);
                    }
                }

                if (bypassTypes.length > 0) {
                    results.push({
                        'CONTROLLER': controllerName,
                        'PROGRAM': programName,
                        'ROUTINE': routineName,
                        'RUNG': $rung.attr('Number') || rungIdx,
                        'COMMENT': $rung.find('Comment').text() || '',
                        'LEVEL': programClass,
                        'BY-PASS': bypassTypes.join(', '),
                        'BACKUP': lastEdit,
                        'AUDIT. DATA': auditDate
                    });
                }
            });

            // --- RELATÓRIO DE PROGRESSO ---
            const percent = Math.round(((i + 1) / totalRoutines) * 100);
            setImmediate(() => {
                parentPort.postMessage({
                    type: 'PROGRESS',
                    payload: {
                        current: i + 1,
                        total: totalRoutines,
                        percent,
                        lastRoutine: routineName
                    }
                });
            })
        }

        const totalRoutinesScanned = $routines.filter((_, el) => {
            const name = $(el).attr('Name');
            return name !== 'Empty';
        }).length;
        const uniquePrograms = new Set();
        results.forEach(r => uniquePrograms.add(r['PROGRAM']));
        parentPort.postMessage({
            type: 'SUCCESS',
            payload: {
                results,
                totalRoutinesScanned,
                totalPrograms: uniquePrograms.size
            }
        });
    } catch (error) {
        parentPort.postMessage({ type: 'ERROR', payload: error.message });
    }
};

L5XScanWorker();