import { ipcMain, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'
import { logger } from '../services/logger'

type SenderEvent = Pick<IpcMainEvent, 'senderFrame'> | Pick<IpcMainInvokeEvent, 'senderFrame'>

let isTrustedUrl: (url: string) => boolean = () => false

/** Set once by the main entry: which page URLs may talk to the privileged handlers. */
export function setTrustedRendererCheck(check: (url: string) => boolean): void {
  isTrustedUrl = check
}

/**
 * True only when the message comes from the top frame of the bundled renderer.
 * A foreign page or an embedded frame (which navigation guards should already
 * keep out) gets nothing from the privileged handlers either.
 */
export function isTrustedSender(event: SenderEvent, check: (url: string) => boolean = isTrustedUrl): boolean {
  const frame = event.senderFrame as { url?: unknown; parent?: unknown } | null | undefined
  if (!frame || typeof frame.url !== 'string') return false
  if (frame.parent) return false
  return check(frame.url)
}

/** ipcMain.handle / ipcMain.on that refuse any sender that is not the app's own page. */
export const secureIpc = {
  handle(channel: string, listener: (event: IpcMainInvokeEvent, ...args: never[]) => unknown): void {
    ipcMain.handle(channel, (event, ...args) => {
      if (!isTrustedSender(event)) {
        logger.warn('Blocked IPC from untrusted sender', { channel })
        throw new Error('Untrusted sender')
      }
      return listener(event, ...(args as never[]))
    })
  },
  on(channel: string, listener: (event: IpcMainEvent, ...args: never[]) => void): void {
    ipcMain.on(channel, (event, ...args) => {
      if (!isTrustedSender(event)) {
        logger.warn('Blocked IPC from untrusted sender', { channel })
        // sendSync callers wait for a value
        event.returnValue = null
        return
      }
      listener(event, ...(args as never[]))
    })
  }
}
