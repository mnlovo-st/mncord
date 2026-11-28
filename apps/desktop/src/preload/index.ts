// The only bridge between the sandboxed UI and the main process. Keep it small and typed.
import { contextBridge, ipcRenderer, webFrame } from 'electron';

export interface CaptureSource { id: string; name: string; thumbnail: string; icon: string | null }

function on<T>(channel: string, cb: (v: T) => void) {
  const h = (_e: unknown, v: T) => cb(v);
  ipcRenderer.on(channel, h);
  return () => {
    ipcRenderer.removeListener(channel, h);
  };
}

const api = {
  platform: process.platform,
  capture: {
    listSources: (): Promise<CaptureSource[]> => ipcRenderer.invoke('capture:list-sources'),
    selectSource: (id: string): Promise<void> => ipcRenderer.invoke('capture:select-source', id),
  },
  /** Refresh token lives encrypted with Windows DPAPI (safeStorage) in the main process, never in localStorage. */
  auth: {
    load: (): Promise<string | null> => ipcRenderer.invoke('auth:load'),
    save: (refreshToken: string): Promise<void> => ipcRenderer.invoke('auth:save', refreshToken),
    clear: (): Promise<void> => ipcRenderer.invoke('auth:clear'),
  },
  ptt: {
    configure: (b: { kind: 'key'; code: string } | { kind: 'mouse'; button: number } | null): Promise<void> => ipcRenderer.invoke('ptt:configure', b),
    onState: (cb: (down: boolean) => void) => {
      const h = (_e: unknown, down: boolean) => cb(!!down);
      ipcRenderer.on('ptt:state', h);
      return () => {
        ipcRenderer.removeListener('ptt:state', h);
      };
    },
  },
  window: {
    flash: (): Promise<void> => ipcRenderer.invoke('win:flash'),
    setTitleBar: (c: { color: string; symbolColor: string }): Promise<void> => ipcRenderer.invoke('win:titlebar', c),
    setCloseToTray: (on: boolean): Promise<void> => ipcRenderer.invoke('win:close-to-tray', on),
    getAutostart: (): Promise<boolean> => ipcRenderer.invoke('win:get-autostart'),
    setAutostart: (on: boolean): Promise<void> => ipcRenderer.invoke('win:set-autostart', on),
    /** UI size (Appearance): real browser zoom, so popups and tooltips stay where they belong */
    setZoom: (factor: number) => webFrame.setZoomFactor(Math.min(2, Math.max(0.5, factor))),
  },
  update: {
    onReady: (cb: (version: string) => void) => {
      const h = (_e: unknown, v: string) => cb(String(v));
      ipcRenderer.on('update:ready', h);
      return () => {
        ipcRenderer.removeListener('update:ready', h);
      };
    },
    install: (): Promise<void> => ipcRenderer.invoke('update:install'),
    onAvailable: (cb: (info: { version: string; notes: string }) => void) => on('update:available', cb),
    onInfo: (cb: (info: { version: string; notes: string }) => void) => on('update:info', cb),
    onProgress: (cb: (p: { percent: number; bps: number; transferred: number; total: number }) => void) => on('update:progress', cb),
  },
  app: {
    version: (): Promise<string> => ipcRenderer.invoke('app:version'),
  },
  games: {
    /** names of running programs (lower-case exe names), for "Playing …" */
    running: (): Promise<string[]> => ipcRenderer.invoke('games:running'),
  },
  log: {
    error: (msg: string): Promise<void> => ipcRenderer.invoke('log:error', msg),
  },
  spike: {
    report: (role: 'publisher' | 'viewer', data: unknown): Promise<void> => ipcRenderer.invoke('spike:report', role, data),
  },
};

contextBridge.exposeInMainWorld('mncord', api);
export type MncordApi = typeof api;
