import { app, BrowserWindow, safeStorage, shell } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { setupIpcHandlers, setupAuthHandlers } from './ipc-handlers'
import { safeOpenExternal } from './utils/safe-open'
import { getOsInfo } from './utils/os-utils'
import { logger } from './services/logger'
import { appStore } from './services/app-store'
import { AuthService } from './auth/auth-service'
import { AuthClient } from './auth/auth-client'
import { TokenStore } from './auth/token-store'
import { configService } from './services/config-service'
import { findCallbackInArgv } from './auth/callback-parser'
import { isAllowedAuthUrl } from './utils/url-policy'
import { IPC_CHANNELS } from '../shared/types'

// Read settings from electron-store before app is ready
const themeColors = { aurora: '#320d40', mono: '#1a1a1a', tropical: '#0a0a0f' } as const
const savedTheme = appStore.get('settings').theme as keyof typeof themeColors
const bgColor = themeColors[savedTheme] || themeColors.tropical

let mainWindow: BrowserWindow | null = null
let authService: AuthService | null = null

// Register custos:// as the default protocol client so the OS routes the
// auth-callback deep link back to this app. On Windows in dev, the protocol
// must point at the electron binary + the launched script path.
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('custos', process.execPath, [process.argv[1]])
  }
} else {
  app.setAsDefaultProtocolClient('custos')
}

// Single-instance lock: a second launch (e.g. Windows delivering the deep link
// as a fresh process) must forward its argv to the running instance, not start
// a parallel one. If we don't own the lock, quit — the primary handles it.
const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    // Windows: the deep link arrives as an argv entry on the 2nd launch.
    const callbackUrl = findCallbackInArgv(argv)
    if (callbackUrl && authService) void authService.handleCallback(callbackUrl)
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
  // macOS dev parity: open-url delivers the deep link directly to the running app.
  app.on('open-url', (event, url) => {
    event.preventDefault()
    if (authService) void authService.handleCallback(url)
  })
}

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

  // Deny every renderer permission request (camera, mic, notifications,
  // clipboard, etc.). This is a forensic tool; it needs none of them.
  mainWindow.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))

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

  // Construct + wire the AuthService with its real deps. All networking and the
  // bearer token stay in main; the renderer only ever sees the public AuthState.
  const authConfig = configService.loadAuthConfig()
  authService = new AuthService({
    client: new AuthClient(authConfig.webBaseUrl),
    tokens: new TokenStore({ safeStorage, store: appStore as never }),
    config: authConfig,
    openExternal: (url) => {
      // Only the exact 97437.dev auth/device/profile URLs may reach the browser.
      if (isAllowedAuthUrl(url, authConfig.webBaseUrl)) {
        void shell.openExternal(url)
      } else {
        logger.warn('Blocked auth openExternal (not allowlisted)')
      }
    },
    onChange: (state) => {
      // Push every state change to the renderer (auth:changed).
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC_CHANNELS.AUTH_CHANGED, state)
      }
    }
  })
  setupAuthHandlers(mainWindow, authService)

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

  // Warm the OS/arch caches now (one short reg.exe query on Windows) so the
  // first IPC call never pays for it.
  getOsInfo()

  // Set app user model id for Windows
  electronApp.setAppUserModelId('com.custos.app')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()
  logger.info('Main window created')

  // Validate any persisted session against the server (no-ops if disabled or
  // logged out). Non-blocking — the window is already up.
  void authService?.validateOnStartup()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  logger.logShutdown()
  app.quit()
})


