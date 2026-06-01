import { describe, it, expect } from 'vitest'
import { parseWindowJson, parseTasklistModules } from './window-module-scanner'

// ---------------------------------------------------------------------------
// parseWindowJson
// ---------------------------------------------------------------------------

describe('parseWindowJson', () => {
  it('returns empty array for empty input', () => {
    expect(parseWindowJson('')).toEqual([])
    expect(parseWindowJson('   ')).toEqual([])
  })

  it('returns empty array for invalid JSON', () => {
    expect(parseWindowJson('not json at all')).toEqual([])
  })

  it('parses a single-object response (one windowed process)', () => {
    const raw = JSON.stringify({
      ProcessName: 'notepad',
      Id: 1234,
      MainWindowTitle: 'Untitled - Notepad'
    })
    const result = parseWindowJson(raw)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      processName: 'notepad',
      id: 1234,
      mainWindowTitle: 'Untitled - Notepad'
    })
  })

  it('parses an array response (multiple windowed processes)', () => {
    const raw = JSON.stringify([
      { ProcessName: 'chrome', Id: 2000, MainWindowTitle: 'New Tab - Google Chrome' },
      { ProcessName: 'cheatapp', Id: 3000, MainWindowTitle: 'cheatapp v2.1' }
    ])
    const result = parseWindowJson(raw)
    expect(result).toHaveLength(2)
    expect(result[0].processName).toBe('chrome')
    expect(result[1].processName).toBe('cheatapp')
    expect(result[1].mainWindowTitle).toBe('cheatapp v2.1')
  })

  it('skips entries where MainWindowTitle is empty/missing', () => {
    const raw = JSON.stringify([
      { ProcessName: 'svchost', Id: 500, MainWindowTitle: '' },
      { ProcessName: 'notepad', Id: 600, MainWindowTitle: 'doc.txt' }
    ])
    const result = parseWindowJson(raw)
    expect(result).toHaveLength(1)
    expect(result[0].processName).toBe('notepad')
  })

  it('is robust to missing fields (uses defaults)', () => {
    // Only MainWindowTitle is present — others should default
    const raw = JSON.stringify({ MainWindowTitle: 'Unknown app' })
    const result = parseWindowJson(raw)
    expect(result).toHaveLength(1)
    expect(result[0].processName).toBe('')
    expect(result[0].id).toBe(0)
    expect(result[0].mainWindowTitle).toBe('Unknown app')
  })

  it('handles compact JSON from ConvertTo-Json -Compress', () => {
    const raw = '[{"ProcessName":"explorer","Id":888,"MainWindowTitle":"Desktop"},{"ProcessName":"hack","Id":999,"MainWindowTitle":"Hack Tool 3.0"}]'
    const result = parseWindowJson(raw)
    expect(result).toHaveLength(2)
    expect(result[1].mainWindowTitle).toBe('Hack Tool 3.0')
  })
})

// ---------------------------------------------------------------------------
// parseTasklistModules
// ---------------------------------------------------------------------------

// Representative excerpt of `tasklist /m` output (Windows English locale).
// Format: one line per process — ImageName, PID, comma-separated module list.
const SAMPLE_TASKLIST_OUTPUT = `
Image Name                     PID Modules
========================= ======== ============================================
System                          4 ntdll.dll, wow64.dll
svchost.exe                   844 ntdll.dll, kernel32.dll, kernelbase.dll
cheatengine-x86_64.exe       4242 ntdll.dll, kernel32.dll, cheat_hook.dll, speed_hack.dll
notepad.exe                  5000 ntdll.dll, gdi32.dll
`

describe('parseTasklistModules', () => {
  it('returns empty array for empty input', () => {
    expect(parseTasklistModules('')).toEqual([])
  })

  it('associates modules with the correct process', () => {
    const entries = parseTasklistModules(SAMPLE_TASKLIST_OUTPUT)
    const cheats = entries.filter(e => e.processName === 'cheatengine-x86_64.exe')
    expect(cheats.map(e => e.moduleName)).toContain('cheat_hook.dll')
    expect(cheats.map(e => e.moduleName)).toContain('speed_hack.dll')
  })

  it('does not associate modules with the previous process after a new header', () => {
    const entries = parseTasklistModules(SAMPLE_TASKLIST_OUTPUT)
    const notepad = entries.filter(e => e.processName === 'notepad.exe')
    const moduleNames = notepad.map(e => e.moduleName)
    // notepad should have its own modules but NOT cheat_hook.dll
    expect(moduleNames).toContain('ntdll.dll')
    expect(moduleNames).toContain('gdi32.dll')
    expect(moduleNames).not.toContain('cheat_hook.dll')
  })

  it('handles System process with no named modules gracefully', () => {
    const entries = parseTasklistModules(SAMPLE_TASKLIST_OUTPUT)
    const system = entries.filter(e => e.processName === 'System')
    // System block has ntdll.dll and wow64.dll
    expect(system.map(e => e.moduleName)).toContain('ntdll.dll')
    expect(system.map(e => e.moduleName)).toContain('wow64.dll')
  })

  it('skips the separator line and header line', () => {
    const entries = parseTasklistModules(SAMPLE_TASKLIST_OUTPUT)
    // No entry should have processName that looks like the header text
    const headerEntry = entries.find(e => e.processName === 'Image Name')
    expect(headerEntry).toBeUndefined()
  })

  it('returns all module entries across all processes', () => {
    const entries = parseTasklistModules(SAMPLE_TASKLIST_OUTPUT)
    // System: 2, svchost: 3, cheatengine: 4, notepad: 2 = 11 total
    expect(entries.length).toBe(11)
  })

  it('handles CRLF line endings from Windows output', () => {
    const crlfOutput = SAMPLE_TASKLIST_OUTPUT.replace(/\n/g, '\r\n')
    const entries = parseTasklistModules(crlfOutput)
    expect(entries.length).toBeGreaterThan(0)
    // spot-check
    const cheat = entries.filter(e => e.processName === 'cheatengine-x86_64.exe')
    expect(cheat.map(e => e.moduleName)).toContain('cheat_hook.dll')
  })
})
