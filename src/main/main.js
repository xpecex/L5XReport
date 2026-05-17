/**
 * L5XReport Electron main process.
 * Initializes the application, creates the primary window, configures performance flags, and registers IPC handlers.
 * @module main/main
 */
'use strict';

const { app, BrowserWindow, Menu } = require('electron/main');

/**
 * Performance configuration — Chromium and V8 command-line switches.
 * Enables GPU acceleration, disables unnecessary features, and optimizes JavaScript runtime for low memory footprint.
 */

// Força a aceleração de hardware mesmo em GPUs mais antigas ou drivers específicos
app.commandLine.appendSwitch('ignore-gpu-blocklist');

// Habilita a rasterização por GPU (acelera o desenho de elementos complexos)
app.commandLine.appendSwitch('enable-gpu-rasterization');

// Reduz a latência de cópia de memória entre CPU e GPU
app.commandLine.appendSwitch('enable-zero-copy');

// Melhora a performance de renderização em janelas sobrepostas
app.commandLine.appendSwitch('enable-begin-frame-scheduling');

// Evita que o Chromium reduza a prioridade de timers quando a janela está em segundo plano
// (Útil se o seu scan precisar rodar rápido mesmo com a janela minimizada)
app.commandLine.appendSwitch('disable-background-timer-throttling');

// força GPU path
app.commandLine.appendSwitch('disable-software-rasterizer');

// Flags JS
app.commandLine.appendSwitch('js-flags', [
    '--max-old-space-size=512',      // limita heap (default 700MB+ é excessivo para uma app desktop)
    '--optimize-for-size',           // favorece memória sobre velocidade de JIT
    '--turbo-fast-api-calls',        // otimiza chamadas de API nativas
    '--nouse-idle-notification',      // Impede o V8 de gastar tempo limpando memória em momentos de ociosidade
    '--concurrent-recompilation',    // recompilação JIT em thread separada
    '--parallel-compile-tasks=4',    // tasks paralelas de compilação (ajusta ao nº de cores)
].join(' '));

// Pula a detecção automática de proxy, o que acelera significativamente a inicialização
app.commandLine.appendSwitch('proxy-server', 'direct://');

// Desativar recursos do Chromium pode liberar ciclos de CPU.
app.commandLine.appendSwitch('disable-http-cache');
app.commandLine.appendSwitch('disable-background-networking');
app.commandLine.appendSwitch('disable-default-apps');
app.commandLine.appendSwitch('disable-extensions');
app.commandLine.appendSwitch('disable-component-update');
app.commandLine.appendSwitch('disable-domain-reliability');
app.commandLine.appendSwitch('disable-sync');
app.commandLine.appendSwitch('no-first-run');
app.commandLine.appendSwitch('no-default-browser-check');
app.commandLine.appendSwitch('disable-features', [
    'TranslateUI',
    'OptimizationHints',
    'MediaRouter',
    'DialMediaRouteProvider',
    'InterestFeedContentSuggestions',
].join(','));

let mainWindow = null;

/**
 * Creates the primary BrowserWindow for the application.
 * Loads the renderer HTML, configures secure webPreferences (contextIsolation + nodeIntegration: false),
 * and uses preload script path adjusted for packaged vs. development builds.
 * @function createWindow
 */
const createWindow = () => {

    const path = require('node:path');

    mainWindow = new BrowserWindow({
        width: 800,
        height: 640,
        show: false,
        backgroundColor: '#0f0f0f',
        webPreferences: {
            preload: app.isPackaged ? path.join(app.getAppPath(), 'src/preload/preload.js') : path.resolve('src/preload', 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    if (!app.isPackaged) {
        mainWindow.webContents.on('before-input-event', (event, input) => {
            if (input.type === 'keyDown' && input.key === 'F12') {
                mainWindow.webContents.toggleDevTools();
            }
        });
    }

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    mainWindow.loadFile(app.isPackaged ? path.join(app.getAppPath(), 'src/renderer/index.html') : path.resolve('src/renderer/index.html'));
};

/**
 * Electron `ready` event handler.
 * Sets up the app lifecycle: removes application menu, creates the main window, and registers IPC handlers.
 * Handles macOS `activate` event to recreate window if all windows are closed.
 */
app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    createWindow();
    require('./ipcHandlers').registerIpcHandlers(mainWindow);

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

/**
 * Electron `window-all-closed` event handler.
 * Terminates any active worker thread before quitting. On non-macOS platforms the app quits immediately;
 * on macOS it stays alive until the user explicitly closes the app (standard macOS behavior).
 */
app.on('window-all-closed', () => {
    const { getActiveWorker, setActiveWorker } = require('./ipcHandlers');
    const worker = getActiveWorker();
    if (worker) {
        worker.terminate();
        setActiveWorker(null);
    }
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
