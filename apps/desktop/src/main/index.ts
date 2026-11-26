import { execFile } from 'node:child_process';
// mncord main process. (c) mnlovo
import { app, BrowserWindow, crashReporter, desktopCapturer, ipcMain, Menu, nativeImage, net, protocol, safeStorage, session, shell, Tray, type WebContents } from 'electron';
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, normalize, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

const isDev = !app.isPackaged;
const DEV_URL = process.env.ELECTRON_RENDERER_URL; // set by electron-vite in dev

// The UI is served from a private app://mncord origin instead of file://. The packaged binary keeps the
// GrantFileProtocolExtraPrivileges fuse OFF (file:// pages get no special powers), so this is the way the
// window reads its own files; it also gives the page a real, fixed origin for the CSP.
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true, codeCache: true } },
]);
const RENDERER_DIR = join(__dirname, '../renderer');
function serveApp() {
  protocol.handle('app', (req) => {
    const url = new URL(req.url);
    if (url.host !== 'mncord') return new Response('not found', { status: 404 });
    const file = normalize(join(RENDERER_DIR, decodeURIComponent(url.pathname)));
    const rel = relative(RENDERER_DIR, file);
    if (rel.startsWith('..') || rel.includes(':')) return new Response('not found', { status: 404 }); // no path walking
    return net.fetch(pathToFileURL(file).toString());
  });
}

// ── Spike automation (M0). MNCORD_SPIKE=screen|canvas4k runs publisher + viewer and writes a report.
const spike = process.env.MNCORD_SPIKE as 'screen' | 'canvas4k' | undefined;
const spikeFps = Number(process.env.MNCORD_SPIKE_FPS ?? 120);
const spikeCodec = process.env.MNCORD_SPIKE_CODEC ?? 'h264';
const spikeSeconds = Number(process.env.MNCORD_SPIKE_SECONDS ?? 25);
const spikeOut = process.env.MNCORD_SPIKE_OUT;

// GPU and WebRTC: keep hardware encode/decode on, don't throttle hidden windows (viewer/publisher run side by side).
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch(
  'enable-features',
  [
    'WebRtcAllowH265Send',
    'WebRtcAllowH265Receive',
    // Windows Graphics Capture: GPU-side screen/window capture, needed for Go Live above 60 fps
    'WebRtcAllowWgcScreenCapturer',
    'WebRtcAllowWgcWindowCapturer',
    'WebRtcAllowWgcZeroHz',
    ...(process.env.MNCORD_SPIKE_FEATURES ?? '').split(',').filter(Boolean),
  ].join(','),
);
app.commandLine.appendSwitch('force_high_performance_gpu');
if (process.env.MNCORD_SPIKE_DISABLE_FEATURES) app.commandLine.appendSwitch('disable-features', process.env.MNCORD_SPIKE_DISABLE_FEATURES);

let pendingSourceId: string | null = null;

// ── Crash + error log (local only, nothing is uploaded). Native crash dumps go to userData/Crashpad.
crashReporter.start({ uploadToServer: false });
const logFile = () => join(app.getPath('userData'), 'logs', 'mncord.log');
function logLine(kind: string, msg: string) {
  try {
    mkdirSync(dirname(logFile()), { recursive: true });
    if (existsSync(logFile()) && statSync(logFile()).size > 5 * 1024 * 1024) writeFileSync(logFile(), ''); // keep it small
    appendFileSync(logFile(), `${new Date().toISOString()} [${kind}] ${msg.replace(/Bearer\s+\S+/g, 'Bearer ***').slice(0, 4000)}\n`);
  } catch {
    /* never crash while logging a crash */
  }
}
process.on('uncaughtException', (e) => logLine('main', e.stack ?? String(e)));
process.on('unhandledRejection', (e) => logLine('main', String((e as Error)?.stack ?? e)));

// ── One window, one instance. A second launch focuses the running app.
if (!process.env.MNCORD_SPIKE && !app.requestSingleInstanceLock()) app.quit();
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let closeToTray = true;
let quitting = false;
app.on('second-instance', () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
});
app.on('before-quit', () => (quitting = true));
const resourcePath = (name: string) => (app.isPackaged ? join(process.resourcesPath, name) : join(__dirname, '../../resources', name));

function setupTray(win: BrowserWindow) {
  if (tray) return;
  tray = new Tray(nativeImage.createFromPath(resourcePath('tray.png')));
  tray.setToolTip('mncord');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'mncord', enabled: false },
    { type: 'separator' },
    { label: 'Open / فتح', click: () => { win.show(); win.focus(); } },
    { label: 'Quit / خروج', click: () => { quitting = true; app.quit(); } },
  ]));
  tray.on('click', () => { win.show(); win.focus(); });
}

function rendererUrl(page: string, query: Record<string, string | number>) {
  const qs = new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)])).toString();
  return DEV_URL ? `${DEV_URL}/${page}.html?${qs}` : `app://mncord/${page}.html?${qs}`;
}

function isOurOrigin(url: string) {
  return (DEV_URL && url.startsWith(DEV_URL)) || url.startsWith('app://mncord/');
}

function harden(contents: WebContents) {
  contents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  contents.on('will-navigate', (e, url) => {
    if (!isOurOrigin(url)) e.preventDefault();
  });
  contents.on('will-attach-webview', (e) => e.preventDefault());
}

function createWindow(page: string, query: Record<string, string | number>, bounds?: Partial<Electron.Rectangle>) {
  const win = new BrowserWindow({
    width: bounds?.width ?? 1280,
    height: bounds?.height ?? 800,
    x: bounds?.x,
    y: bounds?.y,
    minWidth: 940,
    minHeight: 500,
    backgroundColor: '#0a0e16',
    title: 'mncord',
    // our own dark title bar; Windows still draws the real minimise / maximise / close buttons on top
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0a0e16', symbolColor: '#a3aec4', height: 32 },
    icon: resourcePath('icon.png'),
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
      backgroundThrottling: false,
    },
  });
  harden(win.webContents);
  if (spike || isDev) {
    win.webContents.on('console-message', (e) => {
      if (e.level === 'warning' || e.level === 'error') console.log(`[${query.role ?? page}] ${e.level}: ${e.message}`);
    });
  }
  win.once('ready-to-show', () => win.show());
  void win.loadURL(rendererUrl(page, query));
  return win;
}

function setupSession() {
  const ses = session.defaultSession;
  // Only our own pages may use mic / camera / screen; everything else is denied.
  ses.setPermissionRequestHandler((wc, permission, cb) => {
    const ok = isOurOrigin(wc.getURL()) && ['media', 'display-capture', 'notifications', 'clipboard-sanitized-write', 'fullscreen'].includes(permission);
    cb(ok);
  });
  ses.setPermissionCheckHandler((wc, permission) => !!wc && isOurOrigin(wc.getURL()) && ['media', 'display-capture', 'fullscreen'].includes(permission));

  // getDisplayMedia → the source chosen in our own Go Live picker (or the primary screen in spike mode).
  ses.setDisplayMediaRequestHandler(
    async (_req, cb) => {
      const sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 0, height: 0 } });
      const chosen = sources.find((s) => s.id === pendingSourceId) ?? (spike ? sources.find((s) => s.id.startsWith('screen:')) : undefined);
      pendingSourceId = null;
      if (!chosen) return cb({});
      // 'loopback' = system audio on Windows (per-app audio comes later via a native module)
      cb({ video: chosen, audio: chosen.id.startsWith('screen:') ? 'loopback' : undefined });
    },
    { useSystemPicker: false },
  );
}

// ── IPC: a small, typed, allow-listed surface (see preload).
ipcMain.handle('capture:list-sources', async () => {
  const sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 320, height: 180 }, fetchWindowIcons: true });
  return sources.map((s) => ({ id: s.id, name: s.name, thumbnail: s.thumbnail.toDataURL(), icon: s.appIcon?.toDataURL() ?? null }));
});
ipcMain.handle('capture:select-source', (_e, id: unknown) => {
  if (typeof id !== 'string' || !/^(screen|window):[\w:-]+$/.test(id)) throw new Error('bad source id');
  pendingSourceId = id;
});

// ── Token vault: refresh token encrypted with the OS (DPAPI on Windows) in userData.
const vaultFile = () => join(app.getPath('userData'), 'session.bin');
// title bar buttons follow the theme (dark, light, AMOLED)
ipcMain.handle('win:titlebar', (e, c: { color: string; symbolColor: string }) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  const ok = (v: unknown) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
  if (w && ok(c?.color) && ok(c?.symbolColor)) w.setTitleBarOverlay({ color: c.color, symbolColor: c.symbolColor, height: 32 });
});
ipcMain.handle('win:flash', (e) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (w && !w.isFocused()) w.flashFrame(true);
});
ipcMain.handle('win:close-to-tray', (_e, on: unknown) => {
  closeToTray = on === true;
});
ipcMain.handle('win:get-autostart', () => app.getLoginItemSettings().openAtLogin);
ipcMain.handle('win:set-autostart', (_e, on: unknown) => {
  app.setLoginItemSettings({ openAtLogin: on === true, args: ['--hidden'] });
});
ipcMain.handle('log:error', (_e, msg: unknown) => logLine('renderer', String(msg).slice(0, 4000)));
ipcMain.handle('app:version', () => app.getVersion());

// ── "Playing …": the names of running programs (no window titles, nothing else). The app matches them
// against its list of games plus the ones you added; nothing leaves the PC unless it is a game.
let procCache: { at: number; names: string[] } = { at: 0, names: [] };
ipcMain.handle('games:running', async () => {
  if (Date.now() - procCache.at < 10_000) return procCache.names;
  const names = await new Promise<string[]>((resolve) => {
    execFile('tasklist', ['/fo', 'csv', '/nh'], { windowsHide: true, maxBuffer: 4 * 1024 * 1024, timeout: 8000 }, (err, out) => {
      if (err) return resolve([]);
      const set = new Set<string>();
      for (const line of String(out).split(/\r?\n/)) {
        const m = /^"([^"]+)"/.exec(line);
        if (m) set.add(m[1]!.toLowerCase());
      }
      resolve([...set]);
    });
  });
  procCache = { at: Date.now(), names };
  return names;
});

ipcMain.handle('auth:load', () => {
  try {
    if (!safeStorage.isEncryptionAvailable() || !existsSync(vaultFile())) return null;
    return safeStorage.decryptString(readFileSync(vaultFile()));
  } catch {
    return null;
  }
});
ipcMain.handle('auth:save', (_e, token: unknown) => {
  if (typeof token !== 'string' || token.length > 300) throw new Error('bad token');
  if (!safeStorage.isEncryptionAvailable()) return; // never write it in plain text
  writeFileSync(vaultFile(), safeStorage.encryptString(token));
});
ipcMain.handle('auth:clear', () => {
  if (existsSync(vaultFile())) rmSync(vaultFile());
});

// ── Push-to-talk: a global key/mouse hook (works while a game has focus). Only the configured binding is
// watched and only a pressed/released boolean ever leaves the main process: no keylogging.
type PttBinding = { kind: 'key'; code: string } | { kind: 'mouse'; button: number } | null;
let ptt: PttBinding = null;
let pttDown = false;
let hookStarted = false;
const CODE_TO_UIOHOOK: Record<string, string> = {
  Space: 'Space', CapsLock: 'CapsLock', Tab: 'Tab', Backquote: 'Backquote', ControlLeft: 'Ctrl', ControlRight: 'CtrlRight', AltLeft: 'Alt', AltRight: 'AltRight',
  ShiftLeft: 'Shift', ShiftRight: 'ShiftRight', MetaLeft: 'Meta', MetaRight: 'MetaRight', Enter: 'Enter', Backspace: 'Backspace', Insert: 'Insert', Delete: 'Delete',
  Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown', ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight',
  Semicolon: 'Semicolon', Equal: 'Equal', Comma: 'Comma', Minus: 'Minus', Period: 'Period', Slash: 'Slash', BracketLeft: 'BracketLeft', BracketRight: 'BracketRight', Backslash: 'Backslash', Quote: 'Quote',
};
function uiohookName(code: string) {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^F\d{1,2}$/.test(code)) return code;
  if (/^Numpad\d$/.test(code)) return code;
  return CODE_TO_UIOHOOK[code] ?? null;
}
async function configurePtt(binding: PttBinding) {
  ptt = binding;
  pttDown = false;
  if (!binding || hookStarted) return;
  try {
    const { uIOhook, UiohookKey } = await import('uiohook-napi');
    const send = (down: boolean) => {
      if (down === pttDown) return;
      pttDown = down;
      for (const w of BrowserWindow.getAllWindows()) w.webContents.send('ptt:state', down);
    };
    const keyMatch = (keycode: number) => ptt?.kind === 'key' && (UiohookKey as Record<string, number>)[uiohookName(ptt.code) ?? ''] === keycode;
    uIOhook.on('keydown', (e) => keyMatch(e.keycode) && send(true));
    uIOhook.on('keyup', (e) => keyMatch(e.keycode) && send(false));
    uIOhook.on('mousedown', (e) => ptt?.kind === 'mouse' && Number(e.button) === ptt.button && send(true));
    uIOhook.on('mouseup', (e) => ptt?.kind === 'mouse' && Number(e.button) === ptt.button && send(false));
    uIOhook.start();
    hookStarted = true;
    app.on('will-quit', () => uIOhook.stop());
  } catch (err) {
    console.error('[ptt] global hook unavailable, falling back to in-app keys', err);
  }
}
ipcMain.handle('ptt:configure', (_e, b: unknown) => {
  const v = b as PttBinding;
  if (v !== null && !(v && ((v.kind === 'key' && typeof v.code === 'string' && v.code.length < 32) || (v.kind === 'mouse' && Number.isInteger(v.button) && v.button >= 1 && v.button <= 7)))) throw new Error('bad binding');
  return configurePtt(v);
});

const spikeReports: Record<string, unknown> = {};
ipcMain.handle('spike:report', (_e, role: unknown, data: unknown) => {
  if (!spike || (role !== 'publisher' && role !== 'viewer')) return;
  spikeReports[role] = data;
  if (spikeReports.publisher && spikeReports.viewer && spikeOut) {
    mkdirSync(dirname(spikeOut), { recursive: true });
    void app.getGPUInfo('complete').then((info) => {
      const gpu = info as { videoEncodeAcceleratorSupportedProfile?: unknown[]; gpuDevice?: unknown[] };
      writeFileSync(
        spikeOut,
        JSON.stringify(
          { mode: spike, fps: spikeFps, codec: spikeCodec, seconds: spikeSeconds, features: process.env.MNCORD_SPIKE_FEATURES ?? '', ...spikeReports, hwEncodeProfiles: gpu.videoEncodeAcceleratorSupportedProfile ?? [] },
          null,
          2,
        ),
      );
      setTimeout(() => app.quit(), 300);
    });
  }
});

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null); // no File / Edit / View menu: this is a chat app, not an editor
  if (!DEV_URL) serveApp();
  setupSession();
  if (spike) {
    const q = { mode: spike, fps: spikeFps, codec: spikeCodec, seconds: spikeSeconds, room: `spike-${Date.now()}`, capw: process.env.MNCORD_SPIKE_CAPW ?? 3840, caph: process.env.MNCORD_SPIKE_CAPH ?? 2160, legacy: process.env.MNCORD_SPIKE_LEGACY ?? 0 };
    // screen mode: a full-screen window animating at the display's refresh rate stands in for a game
    if (spike === 'screen') {
      const { screen } = await import('electron');
      const b = screen.getPrimaryDisplay().bounds;
      const motion = createWindow('spike', { role: 'motion' }, { x: b.x, y: b.y, width: b.width, height: b.height });
      motion.setAlwaysOnTop(false);
      motion.setFullScreen(true);
    }
    createWindow('spike', { ...q, role: 'publisher' }, { x: 0, y: 0, width: 960, height: 700 });
    setTimeout(() => createWindow('spike', { ...q, role: 'viewer' }, { x: 960, y: 0, width: 960, height: 700 }), 1500);
    setTimeout(() => app.quit(), (spikeSeconds + 40) * 1000); // hard stop
  } else {
    const win = createWindow(process.env.MNCORD_PAGE ?? 'index', {});
    mainWindow = win;
    setupTray(win);
    win.on('focus', () => win.flashFrame(false));
    // closing the window keeps mncord running in the tray (voice keeps working), unless the user turned that off
    win.on('close', (e) => {
      if (closeToTray && !quitting) {
        e.preventDefault();
        win.hide();
      }
    });
    if (process.argv.includes('--hidden')) win.once('ready-to-show', () => win.hide());
    void setupAutoUpdate(win);
  }
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow('index', {});
  });
});

app.on('window-all-closed', () => {
  if (!closeToTray || quitting) app.quit();
});
app.on('web-contents-created', (_e, wc) => harden(wc));
if (isDev) process.on('unhandledRejection', (r) => console.error('[main] unhandled', r));

// ── Auto-update from GitHub Releases. The download is verified against the SHA-512 in latest.yml;
// it installs when the app quits (or on "restart now"), never in the middle of a call.
async function setupAutoUpdate(win: BrowserWindow) {
  if (!app.isPackaged) return;
  try {
    const mod = await import('electron-updater');
    // CommonJS package: the named export may sit on .default depending on the bundler
    const autoUpdater = mod.autoUpdater ?? (mod as unknown as { default: typeof mod }).default.autoUpdater;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowDowngrade = false;
    // the app shows a "Downloading update" card (animated logo + progress + what's new)
    const notes = (n: unknown) => (typeof n === 'string' ? n : Array.isArray(n) ? n.map((x: { note?: string | null }) => x?.note ?? '').join('\n') : '').slice(0, 20_000);
    let lastInfo: { version: string; notes: string } | null = null;
    autoUpdater.on('update-available', (info) => {
      lastInfo = { version: info.version, notes: notes(info.releaseNotes) };
      win.webContents.send('update:available', lastInfo);
    });
    autoUpdater.on('download-progress', (p) => win.webContents.send('update:progress', { percent: p.percent, bps: p.bytesPerSecond, transferred: p.transferred, total: p.total }));
    autoUpdater.on('update-downloaded', (info) => {
      win.webContents.send('update:ready', info.version);
      win.webContents.send('update:info', { version: info.version, notes: notes(info.releaseNotes) || lastInfo?.notes || '' });
    });
    // message only: the raw error carries full HTTP response headers
    autoUpdater.on('error', (e) => logLine('update', String(e?.message ?? e).split(/\r?\n/)[0]!.slice(0, 300)));
    ipcMain.handle('update:install', () => {
      quitting = true;
      autoUpdater.quitAndInstall(true, true);
    });
    await autoUpdater.checkForUpdates().catch(() => null); // errors are logged by the 'error' handler
    // everyone picks new versions up quickly: check every 30 minutes
    setInterval(() => void autoUpdater.checkForUpdates().catch(() => {}), 30 * 60_000);
  } catch (e) {
    logLine('update', String((e as Error)?.message ?? e).split(/\r?\n/)[0]!.slice(0, 300));
  }
}
