import { listModules } from '../native/memory'
import { getProcessCommandLine } from '../native/proc-info'
import type { LiveContext, LiveFinding } from '../../../shared/types'

/** True when the command line enables the Mono soft-debugger agent. */
export function hasDebuggerAgentFlag(cmdline: string): boolean {
  return /--debugger-agent=/i.test(cmdline)
}

/** Legit Mono lives in the game's mono runtime folder; temp/appdata is suspicious. */
const LEGIT_MONO_FRAGMENTS = ['monobleedingedge', '\\mono\\', 'program files']
const SUSPICIOUS_FRAGMENTS = ['\\temp\\', '\\appdata\\local\\temp\\', '\\users\\public\\']

export function isSuspiciousMonoModule(name: string, path: string): boolean {
  const n = name.toLowerCase()
  if (!n.startsWith('mono')) return false
  const p = path.toLowerCase()
  if (LEGIT_MONO_FRAGMENTS.some((f) => p.includes(f))) return false
  return SUSPICIOUS_FRAGMENTS.some((f) => p.includes(f))
}

export const monoDetector = {
  id: 'mono',
  name: 'Mono Debugger-Agent Check',

  async run(ctx: LiveContext): Promise<LiveFinding[]> {
    const findings: LiveFinding[] = []

    if (hasDebuggerAgentFlag(getProcessCommandLine(ctx.pid))) {
      findings.push({
        detectorId: 'mono',
        detectorName: 'Mono Debugger-Agent Check',
        title: 'Mono soft-debugger agent enabled',
        detail: 'The game was launched with --debugger-agent=, which lets a managed debugger attach. Common when developing/loading cheats.',
        confidence: 'high',
        i18nKey: 'monoDebuggerAgent'
      })
    }

    for (const mod of listModules(ctx.pid)) {
      if (isSuspiciousMonoModule(mod.szModule ?? '', mod.szExePath ?? '')) {
        findings.push({
          detectorId: 'mono',
          detectorName: 'Mono Debugger-Agent Check',
          title: 'Mono runtime from suspicious path',
          detail: `${mod.szModule} loaded from ${mod.szExePath}.`,
          confidence: 'suspicious',
          i18nKey: 'monoSuspiciousPath',
          params: { module: mod.szModule ?? '', path: mod.szExePath ?? '' }
        })
      }
    }
    return findings
  }
}
