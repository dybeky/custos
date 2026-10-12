import { describe, it, expect, vi, beforeEach } from 'vitest'

// Every Windows tool "fails": no output at all, or only an error message.
const exec = vi.hoisted(() => ({
  asyncExec: vi.fn(async () => ''),
  execFileAsync: vi.fn(async () => ({ stdout: '', stderr: '' }))
}))
vi.mock('../utils/async-exec', () => exec)

import { ProcessScanner } from './process-scanner'
import { ScheduledTasksScanner } from './scheduled-tasks-scanner'
import { DefenderScanner } from './defender-scanner'
import { WindowModuleScanner } from './window-module-scanner'
import { KeywordMatcher } from '../services/keyword-matcher'
import type { ScanSettings } from '../services/config-service'

const matcher = new KeywordMatcher({ patterns: ['aimbot'], exactMatch: [] })
const settings = { excludedDirectories: [] } as unknown as ScanSettings

beforeEach(() => {
  exec.asyncExec.mockReset().mockResolvedValue('')
  exec.execFileAsync.mockReset().mockResolvedValue({ stdout: '', stderr: '' })
})

/** A source that could not be read is a failed check — never a clean one. */
describe('unread sources are failures, not clean results', () => {
  it('process list: nothing from PowerShell or tasklist', async () => {
    const r = await new ProcessScanner(matcher, settings).scan()
    expect(r.success).toBe(false)
    expect(r.error).toMatch(/process list/i)
  })

  it('process list: a readable list is scanned as usual', async () => {
    exec.asyncExec.mockResolvedValueOnce(JSON.stringify([
      { Name: 'aimbot.exe', ProcessId: 42, ExecutablePath: 'C:\\x\\aimbot.exe', CommandLine: '' },
      { Name: 'explorer.exe', ProcessId: 7, ExecutablePath: 'C:\\Windows\\explorer.exe', CommandLine: '' }
    ]))
    const r = await new ProcessScanner(matcher, settings).scan()
    expect(r.success).toBe(true)
    expect(r.findings).toHaveLength(1)
  })

  it('scheduled tasks: schtasks printed no tasks', async () => {
    const r = await new ScheduledTasksScanner(matcher, settings).scan()
    expect(r.success).toBe(false)
  })

  it('Defender: wevtutil printed only an error', async () => {
    exec.execFileAsync.mockResolvedValue({ stdout: '', stderr: 'Failed to read events. The specified channel could not be found.\r\n' })
    const r = await new DefenderScanner(matcher, settings).scan()
    expect(r.success).toBe(false)
    expect(r.error).toMatch(/channel could not be found/)
  })

  it('Defender: no detections at all is a clean, completed check', async () => {
    const r = await new DefenderScanner(matcher, settings).scan()
    expect(r.success).toBe(true)
    expect(r.findings).toEqual([])
  })

  it('windows & modules: neither could be enumerated', async () => {
    const r = await new WindowModuleScanner(matcher, settings).scan()
    expect(r.success).toBe(false)
  })

  it('windows & modules: one readable source is enough to complete', async () => {
    exec.execFileAsync.mockResolvedValueOnce({ stdout: '"explorer.exe","7","ntdll.dll,aimbot.dll"\r\n', stderr: '' })
    const r = await new WindowModuleScanner(matcher, settings).scan()
    expect(r.success).toBe(true)
    expect(r.findings).toEqual(['module: aimbot.dll (in explorer.exe)'])
  })
})
