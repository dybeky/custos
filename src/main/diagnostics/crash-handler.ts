import { app, BrowserWindow, dialog, shell } from 'electron'
import { logger } from '../services/logger'
import { appStore } from '../services/app-store'
import { safeOpenExternal } from '../utils/safe-open'
import {
  diagnoseError, diagnoseLoadFailure, diagnoseProcessGone, gpuVendorFromId,
  type Diagnosis, type GpuVendor
} from './diagnose'

/**
 * Explain startup failures and crashes to the user instead of vanishing.
 *
 * - An uncaught exception in main → a dialog with the diagnosed cause (and a
 *   download button only when the cause is certain), then exit.
 * - The GPU process crashing → hardware acceleration is switched off for the
 *   next launch and the user is offered a restart (+ their vendor's driver page).
 * - The window process dying or its page failing to load → a dialog with
 *   Reload / the fix.
 */

let dialogOpen = false
let gpuReported = false

/** Must run before app 'ready': honour a GPU fallback chosen after a crash. */
export function applyGpuFallback(): void {
  if (appStore.get('diagnostics')?.disableGpu) {
    app.disableHardwareAcceleration()
    logger.info('Hardware acceleration disabled after a previous graphics crash')
  }
}

/** Show a diagnosis. Resolves with the action the user picked. */
function present(d: Diagnosis, primary: 'reload' | 'restart' | 'close', win?: BrowserWindow | null): 'primary' | 'fix' | 'log' | 'dismiss' {
  const logPath = logger.getLogPath()
  const buttons: Array<{ label: string; action: 'primary' | 'fix' | 'log' }> = []
  if (d.fix) buttons.push({ label: d.fix.label, action: 'fix' })
  buttons.push({ label: primary === 'reload' ? 'Reload' : primary === 'restart' ? 'Restart Custos' : 'Close', action: 'primary' })
  if (logPath) buttons.push({ label: 'Show log file', action: 'log' })

  // Before 'ready' only the simple error box is available.
  if (!app.isReady()) {
    dialog.showErrorBox(`Custos — ${d.title}`, d.fix ? `${d.detail}\n\nFix: ${d.fix.url}` : d.detail)
    return 'dismiss'
  }

  const options = {
    type: 'error' as const,
    title: 'Custos',
    message: d.title,
    detail: d.detail,
    buttons: buttons.map((b) => b.label),
    defaultId: 0,
    cancelId: buttons.findIndex((b) => b.action === 'primary'),
    noLink: true
  }
  const index = win && !win.isDestroyed() ? dialog.showMessageBoxSync(win, options) : dialog.showMessageBoxSync(options)
  const action = buttons[index]?.action ?? 'dismiss'
  if (action === 'fix' && d.fix) safeOpenExternal(d.fix.url)
  if (action === 'log' && logPath) shell.showItemInFolder(logPath)
  return action
}

/** One dialog at a time — a crash loop must not stack dozens of them. */
function presentOnce(d: Diagnosis, primary: 'reload' | 'restart' | 'close', win?: BrowserWindow | null): ReturnType<typeof present> {
  if (dialogOpen) return 'dismiss'
  dialogOpen = true
  try {
    logger.error(`Diagnosis: ${d.id}`, { title: d.title, fix: d.fix?.url })
    return present(d, primary, win)
  } finally {
    dialogOpen = false
  }
}

async function detectGpuVendor(): Promise<GpuVendor> {
  try {
    const info = (await app.getGPUInfo('basic')) as { gpuDevice?: Array<{ vendorId?: number; active?: boolean }> }
    const devices = info.gpuDevice ?? []
    const active = devices.find((d) => d.active) ?? devices[0]
    return gpuVendorFromId(active?.vendorId)
  } catch {
    return null
  }
}

/** Process-wide handlers; call once, early in main. */
export function installCrashHandlers(): void {
  logger.setFatalHandler((error) => {
    presentOnce(diagnoseError(error), 'close')
  })

  app.on('child-process-gone', (_event, details) => {
    if (details.type !== 'GPU' || gpuReported) return
    void (async () => {
      const d = diagnoseProcessGone({ type: details.type, reason: details.reason, exitCode: details.exitCode }, await detectGpuVendor())
      if (!d) return
      gpuReported = true
      appStore.set('diagnostics', { ...(appStore.get('diagnostics') ?? {}), disableGpu: true })
      const choice = presentOnce(d, 'restart', BrowserWindow.getAllWindows()[0])
      if (choice === 'primary' || choice === 'fix') {
        app.relaunch()
        app.exit(0)
      }
    })()
  })
}

/** Per-window handlers: renderer crash and failed page load. */
export function watchWindow(win: BrowserWindow): void {
  win.webContents.on('render-process-gone', (_event, details) => {
    const d = diagnoseProcessGone({ reason: details.reason, exitCode: details.exitCode })
    if (!d) return
    if (presentOnce(d, 'reload', win) === 'primary' && !win.isDestroyed()) win.webContents.reload()
  })

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, _url, isMainFrame) => {
    if (!isMainFrame) return
    const d = diagnoseLoadFailure(errorCode, errorDescription)
    if (!d) return
    if (presentOnce(d, 'close', win) === 'primary') app.quit()
  })
}
