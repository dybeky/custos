import { app, BrowserWindow, safeStorage, shell } from 'electron'
import { join, resolve } from 'path'
import { fileURLToPath } from 'url'
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
import { THEME_SWATCHES, isColorTheme } from '../shared/themes'
import { applyGpuFallback, installCrashHandlers, watchWindow } from './diagnostics/crash-handler'

// Window background shown before the renderer paints; matches the CSS `--bg`
// token so there is no flash of a different colour on launch.
const bgColor = '#0a0908'

// Explain crashes instead of exiting silently, and start without GPU
// acceleration if the graphics driver crashed last time. Both must be in place
// before 'ready'.
installCrashHandlers()
applyGpuFallback()

/** Background for the saved theme, falling back to the default Espresso base. */
function windowBackground(): string {
  const theme = (appStore.get('settings') as { colorTheme?: unknown } | undefined)?.colorTheme
  return isColorTheme(theme) ? THEME_SWATCHES[theme].bg : bgColor
}

let mainWindow: BrowserWindow | null = null
let authService: AuthService | null = null
// ipcMain.handle throws if a channel is registered twice, so the handlers are
// wired exactly once for the app's lifetime even if a window is re-created.
let ipcRegistered = false

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
    backgroundColor: windowBackground(),
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

  watchWindow(mainWindow)

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    safeOpenExternal(details.url)
    return { action: 'deny' }
  })

  // Keep the privileged electronAPI bridge from ever living on a foreign origin
  // or on any local file other than the bundled renderer (a hash-router app
  // never needs a real navigation). Redirects are held to the same rule.
  const blockForeignNavigation = (event: Electron.Event, url: string): void => {
    if (!isAllowedRendererUrl(url)) {
      event.preventDefault()
      logger.warn('Blocked in-frame navigation', { url })
    }
  }
  mainWindow.webContents.on('will-navigate', blockForeignNavigation)
  mainWindow.webContents.on('will-redirect', blockForeignNavigation)

  if (!ipcRegistered) {
    registerIpc(mainWindow)
    ipcRegistered = true
  }

  // Load the renderer
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(RENDERER_INDEX)
  }
}

const RENDERER_INDEX = join(__dirname, '../renderer/index.html')

/** True for the dev server origin or the packaged renderer's index.html. */
function isAllowedRendererUrl(url: string): boolean {
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (is.dev && devUrl) {
    try {
      return new URL(url).origin === new URL(devUrl).origin
    } catch {
      return false
    }
  }
  try {
    const target = new URL(url)
    if (target.protocol !== 'file:') return false
    const norm = (p: string): string => (process.platform === 'win32' ? resolve(p).toLowerCase() : resolve(p))
    return norm(fileURLToPath(target)) === norm(RENDERER_INDEX)
  } catch {
    return false
  }
}

/**
 * Register every IPC handler once. The handlers close over `win` for pushes;
 * this app has a single main window for its whole lifetime.
 */
function registerIpc(win: BrowserWindow): void {
  setupIpcHandlers(win)

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
  setupAuthHandlers(win, authService)
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
  authService?.validateOnStartup().catch((err) =>
    logger.warn('Startup session validation failed', { error: err instanceof Error ? err.message : String(err) })
  )

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  logger.logShutdown()
  app.quit()
})


