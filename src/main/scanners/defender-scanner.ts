import { BaseScanner, ScannerEventEmitter } from './base-scanner'
import { ScanResult } from '../../shared/types'
import { execFileAsync } from '../utils/async-exec'
import { formatTimestamp } from '../utils/format'
import { dedupeDetections, defenderRelevance, parseDefenderEvents } from './defender-history'

const LOG = 'Microsoft-Windows-Windows Defender/Operational'

/**
 * Windows Defender's own detection history, filtered to game cheats and cheat
 * tooling. Microsoft already identified these files; the record survives the
 * file being deleted or quarantined.
 */
export class DefenderScanner extends BaseScanner {
  readonly name = 'Defender History Scanner'
  readonly description = 'Windows Defender detections of cheats and cheat tools'

  protected async doScan(events: ScannerEventEmitter | undefined, startTime: Date): Promise<ScanResult> {
    this.reset()
    this.emitProgress(events, 0, 1, 'Reading Windows Defender detection history...')
    const { stdout } = await execFileAsync(
      'wevtutil',
      ['qe', LOG, '/q:*[System[(EventID=1116 or EventID=1117)]]', '/c:500', '/rd:true', '/f:xml'],
      { timeoutMs: 15000 }
    )
    if (this.cancelled) return this.createErrorResult('Scan cancelled', startTime)

    const contains = (s: string) => this.keywordMatcher.containsKeyword(s)
    const findings: string[] = []
    for (const d of dedupeDetections(parseDefenderEvents(stdout))) {
      const relevance = defenderRelevance(d, contains)
      if (!relevance) continue
      const tag = relevance === 'cheat-family' ? ' (cheat-family)' : ''
      const where = d.paths.length ? ` | ${d.paths.join('; ')}` : ''
      const action = d.action ? ` | action: ${d.action}` : ''
      findings.push(`[Defender] ${d.threatName}${where} | ${formatTimestamp(new Date(d.detectedAt))}${action}${tag}`)
    }

    this.emitProgress(events, 1, 1, '')
    return this.createSuccessResult(findings, startTime)
  }
}
