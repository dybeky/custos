import { app, BrowserWindow, clipboard, dialog } from 'electron'
import { readFileSync } from 'fs'
import { logger } from '../services/logger'
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
 * - The GPU process crashing → the user is offered a restart with hardware
 *   acceleration off (+ their vendor's driver page).
 * - The window process dying or its page failing to load → a dialog with
 *   Reload / the fix.
 */

let dialogOpen = false
let gpuReported = false

/**
 * Relaunch flag set after a GPU-process crash. Passed on the command line
 * rather than saved, because Custos keeps nothing on the checked PC.
 */
export const NO_GPU_FLAG = '--custos-disable-gpu'

/** Must run before app 'ready': honour a GPU fallback chosen after a crash. */
export function applyGpuFallback(argv: readonly string[] = process.argv): void {
  if (argv.includes(NO_GPU_FLAG)) {
    app.disableHardwareAcceleration()
    logger.info('Hardware acceleration disabled after a graphics crash')
  }
}

/** Put the end of the log on the clipboard (enough to report the problem). */
function copyLog(logPath: string): void {
  try {
    const text = readFileSync(logPath, 'utf8')
    clipboard.writeText(text.length > 200_000 ? text.slice(-200_000) : text)
  } catch {
    // log unreadable — nothing to copy
  }
}

/** Show a diagnosis. Resolves with the action the user picked. */
function present(d: Diagnosis, primary: 'reload' | 'restart' | 'close', win?: BrowserWindow | null): 'primary' | 'fix' | 'log' | 'dismiss' {
  const logPath = logger.getLogPath()
  const buttons: Array<{ label: string; action: 'primary' | 'fix' | 'log' }> = []
  if (d.fix) buttons.push({ label: d.fix.label, action: 'fix' })
  buttons.push({ label: primary === 'reload' ? 'Reload' : primary === 'restart' ? 'Restart Custos' : 'Close', action: 'primary' })
  // The log lives in the session folder, which is wiped when Custos exits —
  // a file shown in Explorer would vanish a moment later, so it is copied.
  if (logPath) buttons.push({ label: 'Copy log', action: 'log' })

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
  if (action === 'log' && logPath) copyLog(logPath)
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
      const choice = presentOnce(d, 'restart', BrowserWindow.getAllWindows()[0])
      if (choice === 'primary' || choice === 'fix') {
        const args = process.argv.slice(1).filter((a) => a !== NO_GPU_FLAG)
        app.relaunch({ args: [...args, NO_GPU_FLAG] })
        app.quit()
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
