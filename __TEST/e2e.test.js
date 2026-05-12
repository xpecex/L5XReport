'use strict';

/**
 * @fileoverview End-to-end E2E tests for L5XReport Electron application.
 *
 * Validates the full workflow: file selection, scan execution, report rendering,
 * and PDF generation using Playwright's experimental Electron API.
 *
 * @see https://playwright.dev/docs/api/class-electron
 */

const { _electron: electron } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');

// ============================================================
// Constants
// ============================================================

/** @type {string} Absolute path to the working directory of the application. */
const cwd = path.resolve(__dirname, '..');

/** @type {string} Absolute path to the test L5X controller backup file. */
const testFile = path.resolve(cwd, '__TEST', 'ProjectTest.L5X');

/** @type {string} Expected filename pattern saved during E2E tests. */
const filesPattern = /(\S+\.pdf|\S+\.png)/i;

/** @type {number} Maximum wait time in milliseconds for window events. */
const windowTimeout = 60_000;

/** @type {number} Maximum wait time in milliseconds for PDF generation. */
const pdfTimeout = 30_000;

// ============================================================
// Tests
// ============================================================

/**
 * Validates the complete application workflow:
 * 1. Launches Electron app with E2E_TEST environment flag.
 * 2. Navigates through UI sections — file selection, configuration, scan.
 * 3. Verifies scan results rendering in the report window.
 * 4. Generates PDF and validates its integrity.
 * 5. Cleans up generated artifacts.
 */
test('L5XReport — full scan and PDF generation workflow', async () => {
    /** @type {import('playwright').ElectronApplication} */
    let electronApp;
    /** @type {import('playwright').Page} Main application window. */
    let mainWindow;
    /** @type {import('playwright').Page} Report window. */
    let reportWindow;

    try {
        // --------------------------------------------------------
        // Step 1 — Launch Electron application
        // --------------------------------------------------------
        /**
         * Launches the Electron app with E2E_TEST=true to bypass dialogs
         * and use the built-in test file. cwd ensures relative paths
         * resolve correctly within the project structure.
         */
        electronApp = await electron.launch({
            args: ['src/main/main.js'],
            cwd,
            env: {
                ...process.env,
                E2E_TEST: 'true'
            },
            timeout: 30_000
        });

        // --------------------------------------------------------
        // Step 2 — Wait for main window and verify initial state
        // --------------------------------------------------------
        /**
         * Waits for the first BrowserWindow created by the app.
         * Verifies the title matches the expected L5XReport page.
         */
        mainWindow = await electronApp.firstWindow();
        await mainWindow.waitForLoadState('domcontentloaded');
        await expect(mainWindow).toHaveTitle('L5XReport');
        await mainWindow.screenshot({ path: path.resolve('__TEST', 'step1-main-window.png') });

        // --------------------------------------------------------
        // Step 3 — File selection (Section 1)
        // --------------------------------------------------------
        /**
         * Clicks "Selecionar Arquivo" button. In E2E mode the IPC handler
         * returns ProjectTest.L5X automatically without showing a dialog.
         * Verifies the file path text and enables the "Próximo" button.
         */
        await mainWindow.click('#btn-select-file');
        await expect(mainWindow.locator('#file-path')).toBeVisible();
        const filePathText = await mainWindow.locator('#file-path').textContent();
        expect(filePathText).toContain('ProjectTest.L5X');
        await expect(mainWindow.locator('#btn-clear-file')).not.toBeHidden();

        await mainWindow.click('#btn-next-1');
        await expect(mainWindow.locator('[data-section="2"]')).toBeVisible();

        // --------------------------------------------------------
        // Step 4 — Configuration (Section 2)
        // --------------------------------------------------------
        /**
         * Enables all bypass detection rules:
         * - AFI (Automatic Fault Insertion)
         * - Shorted Branch (parallel branch bypass)
         * - NOP (No Operation)
         * Verifies the "Iniciar Análise" button becomes enabled.
         */
        await mainWindow.locator('#chk-afi').check();
        await mainWindow.locator('#chk-branch').check();
        await mainWindow.locator('#chk-nop').check();

        await expect(mainWindow.locator('#btn-start-scan')).toBeEnabled();
        await mainWindow.click('#btn-start-scan');
        await expect(mainWindow.locator('[data-section="3"]')).toBeVisible();
        await mainWindow.screenshot({ path: path.resolve('__TEST', 'step4-scan-start.png') });

        // --------------------------------------------------------
        // Step 5 — Scan execution
        // --------------------------------------------------------
        /**
         * Waits for the progress bar to reach 100%, indicating the
         * worker thread completed scanning all routines and rangs.
         * Verifies the "Visualizar Relatório" button appears.
         */
        await expect(mainWindow.locator('#progress-percent')).toHaveText('100%');
        await expect(mainWindow.locator('#btn-open-report')).not.toBeHidden();

        await mainWindow.click('#btn-open-report');

        // --------------------------------------------------------
        // Step 6 — Report window rendering
        // --------------------------------------------------------
        /**
         * Waits for the second BrowserWindow (report window) to open.
         * Verifies the report title, screenshot capture, and that scan
         * results data was properly transmitted via IPC.
         */
        reportWindow = await electronApp.waitForEvent('window', { timeout: windowTimeout });
        await reportWindow.waitForLoadState('domcontentloaded');

        /**
         * Validates the report window title matches the expected
         * "L5XReport - BYPASS AUDIT REPORT" format.
         */
        await expect(reportWindow).toHaveTitle('L5XReport - BYPASS AUDIT REPORT');
        await reportWindow.screenshot({ path: path.resolve('__TEST', 'step6-report-window.png') });

        /**
         * Evaluates in the report window context to verify:
         * - The results table has populated rows.
         * - The results count display is visible.
         * - The "Salvar PDF" button is present.
         * - The controller name "ProjectTest" appears in the header.
         */
        const reportCheck = await reportWindow.evaluate(() => {
            const tbody = document.querySelector('table tbody');
            const rowCount = tbody ? tbody.querySelectorAll('tr').length : 0;
            const h2Text = document.querySelector('h2')?.textContent || '';
            const printBtn = document.getElementById('btn-print');
            return {
                rowCount,
                controllerName: h2Text,
                hasPrintBtn: !!printBtn
            };
        });

        expect(reportCheck.rowCount).toBeGreaterThan(0);
        expect(reportCheck.controllerName).toBe('ProjectTest');
        expect(reportCheck.hasPrintBtn).toBe(true);

        // --------------------------------------------------------
        // Step 7 — PDF generation
        // --------------------------------------------------------
        /**
         * Clicks the "Salvar PDF" button in the report window.
         * In E2E mode the IPC handler writes directly to __TEST/
         * without showing a save dialog. Validates the generated PDF
         * exists and contains valid PDF content.
         */
        await reportWindow.click('#btn-print');

        /**
         * Waits for the PDF file to be written to disk. The printToPDF
         * operation includes page rendering and serialization time.
         */
        let pdfPath = null;
        const pdfFiles = fs.readdirSync(path.resolve('__TEST'));
        const matchedPdf = pdfFiles.find(f => /^L5XReport_\S+\.pdf/.test(f));
        if (matchedPdf) {
            pdfPath = path.resolve('__TEST', matchedPdf);
        }

        if (!pdfPath) {
            /**
             * Retries PDF detection after a short delay in case the
             * write operation was still in progress.
             */
            await new Promise(resolve => setTimeout(resolve, 2_000));
            const retryFiles = fs.readdirSync(path.resolve('__TEST'));
            const retryMatched = retryFiles.find(f => /^L5XReport_\S+\.pdf/.test(f));
            if (retryMatched) {
                pdfPath = path.resolve('__TEST', retryMatched);
            }
        }

        expect(pdfPath).toBeDefined();
        expect(pdfPath).toBeTruthy();

        /**
         * Validates the generated PDF file is not empty and contains
         * a valid PDF header (%PDF-1.4 magic bytes at offset 0).
         */
        const pdfBuffer = fs.readFileSync(pdfPath);
        expect(pdfBuffer.length).toBeGreaterThan(100);
        const pdfHeader = pdfBuffer.toString('utf-8', 0, 8);
        expect(pdfHeader).toMatch(/\%PDF-1\.[0-4]+/gmi);

        await reportWindow.screenshot({ path: path.resolve('__TEST', 'step7-pdf-generated.png') });

        // --------------------------------------------------------
        // Step 8 — Cleanup
        // --------------------------------------------------------
        /**
         * Removes all files saves (PNG, PDF) from the __TEST directory generated
         * during the E2E test run to keep the test folder clean.
         */
        const cleanupFiles = fs.readdirSync(path.resolve('__TEST'));
        const filesCleanup = cleanupFiles.filter(f => filesPattern.test(f));
        for (const f of filesCleanup) {
            const fp = path.resolve('__TEST', f);
            fs.unlinkSync(fp);
        }
        const checkCleanupFiles = fs.readdirSync(path.resolve('__TEST'));
        const checkfilesCleanup = checkCleanupFiles.filter(f => filesPattern.test(f));
        expect(checkfilesCleanup.length).toBeLessThanOrEqual(0);


    } finally {
        /**
         * Ensures the Electron application is closed even if test
         * assertions fail, preventing orphaned processes.
         */
        await electronApp.close();
    }
});
