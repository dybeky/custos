/**
 * The message of an error thrown by an ipcMain handler, without the
 * "Error invoking remote method 'x': Error: " prefix Electron adds to it.
 */
export function ipcErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return String(error)
  return error.message.replace(/^Error invoking remote method '[^']*': (?:\w*Error: )?/, '')
}
