import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS, ScanResult, ScanProgress, UserSettings, VersionInfo, ScannerInfo, DownloadProgress, WindowsVersionInfo } from '../shared/types'
import { ScannerName } from '../main/scanners'

export type ScanProgressCallback = (progress: ScanProgress) => void
export type ScanResultCallback = (result: ScanResult) => void
export type ScanCompleteCallback = (results: ScanResult[]) => void
export type ScanErrorCallback = (error: { message: string }) => void

const api = {
  // Scanner operations
  getScanners: (): Promise<ScannerInfo[]> => {
    return ipcRenderer.invoke(IPC_CHANNELS.GET_SCANNERS)
  },

  startScan: (scannerIds?: ScannerName[]): Promise<ScanResult[]> => {
    return ipcRenderer.invoke(IPC_CHANNELS.SCAN_START, scannerIds)
  },

  cancelScan: (): Promise<void> => {
    return ipcRenderer.invoke(IPC_CHANNELS.SCAN_CANCEL)
  },

  // Scan event listeners
  onScanProgress: (callback: ScanProgressCallback): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: ScanProgress): void => {
      callback(progress)
    }
    ipcRenderer.on(IPC_CHANNELS.SCAN_PROGRESS, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.SCAN_PROGRESS, listener)
  },

  onScanResult: (callback: ScanResultCallback): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, result: ScanResult): void => {
      callback(result)
    }
    ipcRenderer.on(IPC_CHANNELS.SCAN_RESULT, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.SCAN_RESULT, listener)
  },

  onScanComplete: (callback: ScanCompleteCallback): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, results: ScanResult[]): void => {
      callback(results)
    }
    ipcRenderer.on(IPC_CHANNELS.SCAN_COMPLETE, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.SCAN_COMPLETE, listener)
  },

  onScanError: (callback: ScanErrorCallback): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, error: { message: string }): void => {
      callback(error)
    }
    ipcRenderer.on(IPC_CHANNELS.SCAN_ERROR, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.SCAN_ERROR, listener)
  },

  // Settings
  getSettings: (): Promise<UserSettings> => {
    return ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET)
  },

  setSettings: (settings: Partial<UserSettings>): Promise<UserSettings> => {
    return ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET, settings)
  },

  // System info
  getWindowsVersion: (): Promise<WindowsVersionInfo> => {
    return ipcRenderer.invoke(IPC_CHANNELS.SYSTEM_GET_WINDOWS_VERSION)
  },

  // App operations
  getVersion: (): Promise<string> => {
    return ipcRenderer.invoke(IPC_CHANNELS.APP_VERSION)
  },

  checkUpdate: (): Promise<VersionInfo> => {
    return ipcRenderer.invoke(IPC_CHANNELS.APP_CHECK_UPDATE)
  },

  downloadUpdate: (downloadUrl: string): Promise<void> => {
    return ipcRenderer.invoke(IPC_CHANNELS.APP_DOWNLOAD_UPDATE, downloadUrl)
  },

  onDownloadProgress: (callback: (progress: DownloadProgress) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: DownloadProgress): void => {
      callback(progress)
    }
    ipcRenderer.on(IPC_CHANNELS.APP_DOWNLOAD_PROGRESS, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.APP_DOWNLOAD_PROGRESS, listener)
  },

  openExternal: (url: string): void => {
    ipcRenderer.invoke(IPC_CHANNELS.APP_OPEN_EXTERNAL, url).catch(() => {})
  },

  openPath: (path: string): void => {
    ipcRenderer.invoke(IPC_CHANNELS.APP_OPEN_PATH, path).catch(() => {})
  },

  openRegistry: (keyPath: string): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke(IPC_CHANNELS.APP_OPEN_REGISTRY, keyPath)
  },

  deleteSelf: (): Promise<void> => {
    return ipcRenderer.invoke(IPC_CHANNELS.APP_DELETE_SELF)
  },

  quit: (): Promise<void> => {
    return ipcRenderer.invoke(IPC_CHANNELS.APP_QUIT)
  },

  // Window controls
  minimize: (): Promise<void> => {
    return ipcRenderer.invoke(IPC_CHANNELS.WINDOW_MINIMIZE)
  },

  maximize: (): Promise<void> => {
    return ipcRenderer.invoke(IPC_CHANNELS.WINDOW_MAXIMIZE)
  },

  close: (): Promise<void> => {
    return ipcRenderer.invoke(IPC_CHANNELS.WINDOW_CLOSE)
  }
}

// Expose API to renderer
contextBridge.exposeInMainWorld('electronAPI', api)

// Type declaration for renderer
export type ElectronAPI = typeof api
