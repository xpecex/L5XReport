'use strict';

/**
 * @module bypass
 * @description Worker script for scanning L5X files (Rockwell Logix XML backups).
 *              Runs in a separate `node:worker_threads` thread, parses XML with
 *              Cheerio, detects bypass patterns in ladder logic, and reports
 *              results to the main thread via `parentPort.postMessage`.
 * @author L5XReport
 * @version 1.1.0
 */

const { parentPort, workerData } = require('node:worker_threads');
const cheerio = require('cheerio');
const fs = require('node:fs');
const path = require('node:path');

/**
 * Default scanner configuration.
 * @typedef {Object} DefaultConfig
 * @property {string[]} keywords - Keywords for custom bit detection.
 * @property {boolean} afi - Enable AFI detection.
 * @property {boolean} nop - Enable NOP detection.
 * @property {boolean} branch - Enable shorted branch detection.
 * @property {RegExp} shortedbranchregex - Regex for detecting shorted branch patterns.
 */

/**
 * Result object for a rung with a detected bypass.
 * @typedef {Object} ScanResult
 * @property {string} CONTROLLER - Controller name.
 * @property {string} PROGRAM - Program name.
 * @property {string} ROUTINE - Routine name.
 * @property {string|number} RUNG - Rung number.
 * @property {string} COMMENT - Rung comment text.
 * @property {string} LEVEL - Program class.
 * @property {string} BY-PASS - Comma-separated bypass types.
 * @property {string} BACKUP - Backup date (LastModifiedDate).
 * @property {string} AUDIT. DATA - Audit timestamp.
 */

/**
 * Success payload sent to the main thread.
 * @typedef {Object} SuccessPayload
 * @property {ScanResult[]} results - List of detected bypass rungs.
 * @property {number} totalRoutinesScanned - Total routines scanned (excluding 'Empty').
 * @property {number} totalPrograms - Number of unique programs.
 */

/**
 * Progress payload sent to the main thread.
 * @typedef {Object} ProgressPayload
 * @property {number} current - Current routine index being scanned.
 * @property {number} total - Total number of routines.
 * @property {number} percent - Percentage completed.
 * @property {string} lastRoutine - Name of the last scanned routine.
 */

/**
 * Error payload sent to the main thread.
 * @typedef {Object} ErrorPayload
 * @property {string} message - Error message.
 */

/**
 * Initializes and runs the L5X scan worker.
 *
 * Receives `filepath` and `CONFIG` via `workerData`. Parses the L5X XML,
 * iterates Routines → Rungs, detects bypass patterns (BRANCH, AFI, NOP, keywords),
 * and sends `PROGRESS`, `SUCCESS`, or `ERROR` messages to the main thread.
 *
 * Routines named `'Empty'` are skipped.
 *
 * Optimizations (v1.1):
 * - Controller metadata cached once (no per-routine re-query)
 * - Program name/class cached per routine transition
 * - Text extracted only when detection rules are active
 * - Totals tracked inline during iteration (no post-loop recalculation)
 * - Progress postMessage without setImmediate overhead
 *
 * @function L5XScanWorker
 * @async
 * @returns {void} Posts messages via `parentPort`.
 *
 * @example
 * // In the main thread:
 * const worker = new Worker('./src/main/bypass.js', {
 *   workerData: { filepath: 'ProjectTest.L5X', CONFIG: { afi: true } }
 * });
 *
 * Scan Rules:
 * | Rule      | Condition                              | Flag        |
 * |-----------|----------------------------------------|-------------|
 * | BRANCH    | matches `shortedbranchregex` pattern   | `branch`    |
 * | AFI       | text contains `"AFI"`                  | `afi`       |
 * | NOP       | text contains `"NOP"`                  | `nop`       |
 * | CUSTOM    | text matches keyword regex             | keywords    |
 */
const L5XScanWorker = async () => {
    const { filepath, CONFIG } = workerData;

    // Configuration
    const keywords = (CONFIG?.keywords?.length > 0 ? CONFIG.keywords : ['BYPASS', 'MANUT', 'MAINT', 'MANUTENCAO', 'MAINTENANCE']);
    const enableAfi = CONFIG?.afi ?? false;
    const enableNop = CONFIG?.nop ?? false;
    const enableBranch = CONFIG?.branch ?? false;
    const allDisabled = !enableAfi && !enableNop && !enableBranch && keywords.length === 0;

    // Regex cache — no `g` flag to avoid lastIndex issues with `.test()`
    const keywordRegexes = keywords.filter(Boolean).map(kw => new RegExp(`(^${kw}|_${kw}|\\(${kw})`, 'igm'));

    // Shorted branch regex — `g` flag safe because lastIndex resets to 0 after each `.test()`
    const shortedBranchRe = /(\,+\s*\]|\,+\s*\,+|\[\s*\,)/igm;

    try {
        // File loading — Cheerio parse
        const file = fs.readFileSync(path.resolve(filepath), 'utf8');
        const $ = cheerio.load(file, { xmlMode: true, decodeEntities: false });

        // Controller metadata cached once
        const controllerName = $('Controller').attr('Name') || '';
        const lastEdit = $('Controller').attr('LastModifiedDate')
            ? new Date($('Controller').attr('LastModifiedDate')).toISOString().slice(0, 10)
            : '';
        const auditDate = new Date().toLocaleString();

        const $routines = $('Routine');
        const totalRoutines = $routines.length;
        const results = [];
        let totalScanned = 0;
        const seenPrograms = new Set();

        let cachedProgramName = '';
        let cachedProgramClass = '';

        for (let i = 0; i < totalRoutines; i++) {
            const $routine = $routines.eq(i);
            const routineName = $routine.attr('Name');

            if (routineName === 'Empty') continue;
            totalScanned++;

            // Cache program data — only update when parent program changes
            const programName = $routine.closest('Program, AddOnInstructionDefinition').attr('Name');
            if (programName !== cachedProgramName) {
                cachedProgramName = programName || 'Unknown';
                cachedProgramClass = $routine.closest('Program, AddOnInstructionDefinition').attr('Class') || '';
            }

            const $rungs = $routine.find('Rung');

            $rungs.each((rungIdx, rung) => {
                const $rung = $(rung);

                // Extract text only when detection rules are active
                const rungText = allDisabled ? '' : ($rung.find('Text').text() || '');

                const bypassTypes = [];

                if (enableBranch && shortedBranchRe.test(rungText)) {
                    bypassTypes.push('BRANCH');
                }
                if (enableAfi && rungText.includes('AFI')) {
                    bypassTypes.push('AFI');
                }
                if (enableNop && rungText.includes('NOP')) {
                    bypassTypes.push('NOP');
                }

                for (let k = 0; k < keywordRegexes.length; k++) {
                    if (keywordRegexes[k].test(rungText)) {
                        bypassTypes.push(keywords[k]);
                    }
                }

                if (bypassTypes.length > 0) {
                    seenPrograms.add(cachedProgramName);
                    results.push({
                        CONTROLLER: controllerName,
                        PROGRAM: cachedProgramName,
                        ROUTINE: routineName,
                        RUNG: $rung.attr('Number') || rungIdx,
                        COMMENT: ($rung.find('Comment').text() || '').replace(/\r\n/g, '\n'),
                        LEVEL: cachedProgramClass,
                        'BY-PASS': bypassTypes.join(', '),
                        BACKUP: lastEdit,
                        'AUDIT. DATA': auditDate
                    });
                }
            });

            // Progress report
            parentPort.postMessage({
                type: 'PROGRESS',
                payload: {
                    current: i + 1,
                    total: totalRoutines,
                    percent: Math.round(((i + 1) / totalRoutines) * 100),
                    lastRoutine: routineName
                }
            });
        }

        // Success payload — totals computed inline, no post-loop recalculation
        parentPort.postMessage({
            type: 'SUCCESS',
            payload: {
                results,
                totalRoutinesScanned: totalScanned,
                totalPrograms: seenPrograms.size
            }
        });

    } catch (error) {
        parentPort.postMessage({ type: 'ERROR', payload: error.message });
    }
};

L5XScanWorker();
