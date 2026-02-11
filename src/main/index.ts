import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { setupIpcHandlers, createCleanupBatch } from './ipc-handlers'
import { logger } from './services/logger'
import Store from 'electron-store'

// Catch unhandled errors to prevent silent crashes
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err)
})
process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err)
})

// Read settings from electron-store before app is ready
const themeColors = { aurora: '#320d40', mono: '#1a1a1a', tropical: '#0a0a0f' } as const
const appStore = new Store<{ settings: { theme: string; disableHardwareAcceleration: boolean } }>({
  defaults: { settings: { theme: 'tropical', disableHardwareAcceleration: false } }
})
const savedTheme = appStore.get('settings.theme') as keyof typeof themeColors
const bgColor = themeColors[savedTheme] || themeColors.tropical

// Disable GPU acceleration if user requested (must be called before app.whenReady)
if (appStore.get('settings.disableHardwareAcceleration')) {
  app.disableHardwareAcceleration()
}

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
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
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
  electronApp.setAppUserModelId('com.cobra.custos')

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
  const settings = appStore.get('settings') as { deleteAfterUse?: boolean } | undefined
  if (settings?.deleteAfterUse) {
    createCleanupBatch(app.getPath('exe'))
  }

  app.quit()
})

// Note: Error handlers are set up in logger service
