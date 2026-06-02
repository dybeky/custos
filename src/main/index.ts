import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { setupIpcHandlers } from './ipc-handlers'
import { safeOpenExternal } from './utils/safe-open'
import { scheduleSelfDestruct } from './services/self-destruct'
import { logger } from './services/logger'
import { appStore } from './services/app-store'

// Read settings from electron-store before app is ready
const themeColors = { aurora: '#320d40', mono: '#1a1a1a', tropical: '#0a0a0f' } as const
const savedTheme = appStore.get('settings').theme as keyof typeof themeColors
const bgColor = themeColors[savedTheme] || themeColors.tropical

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: bgColor,
    icon: join(__dirname, '../../resources/icon.ico'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // Preload only uses electron (contextBridge/ipcRenderer) + inlined type/constant
      // imports — no Node built-ins or app modules — so it is sandbox-compatible.
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    safeOpenExternal(details.url)
    return { action: 'deny' }
  })

  // Keep the privileged electronAPI bridge from ever living on a foreign origin.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowed =
      (is.dev && process.env['ELECTRON_RENDERER_URL'] && url.startsWith(process.env['ELECTRON_RENDERER_URL'])) ||
      url.startsWith('file://')
    if (!allowed) {
      event.preventDefault()
      logger.warn('Blocked in-frame navigation', { url })
    }
  })

  // Setup IPC handlers
  setupIpcHandlers(mainWindow)

  // Load the renderer
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  // Initialize logger
  logger.init()
  logger.logStartup()

  // Set app user model id for Windows
  electronApp.setAppUserModelId('com.custos.app')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()
  logger.info('Main window created')

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  logger.logShutdown()

  // If deleteAfterUse is enabled, schedule cleanup before quitting
  const settings = appStore.get('settings')
  if (settings.deleteAfterUse) {
    scheduleSelfDestruct(app.getPath('exe'))
  }

  app.quit()
})


