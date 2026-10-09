import { describe, it, expect } from 'vitest'
import { ipcErrorMessage } from './ipc-error'

describe('ipcErrorMessage', () => {
  it('drops the prefix Electron adds to a handler error', () => {
    const e = new Error("Error invoking remote method 'scan:start': Error: Scan already in progress")
    expect(ipcErrorMessage(e)).toBe('Scan already in progress')
  })

  it('keeps a plain message and stringifies non-errors', () => {
    expect(ipcErrorMessage(new Error('boom'))).toBe('boom')
    expect(ipcErrorMessage('x')).toBe('x')
  })
})
