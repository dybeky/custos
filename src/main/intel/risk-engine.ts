import { createHash } from 'crypto'
import type {
  ScanResult, AnalyzedFinding, Confidence, FindingCategory, Correlation, Severity, ScoreReason,
  Verdict, VerdictBand, ScanReport, SuppressionState, ScannerName
} from '../../shared/types'
import type { GameId } from '../../shared/games'
import { scannerIdFromDisplayName } from '../../shared/scanners-meta'
import { SCANNER_POLICY, DEFAULT_POLICY, RISK_ENGINE_VERSION } from './scanner-policy'
import { isKnownHashFinding, hashTokenOf } from './finding-tags'
import { extractObservedAt } from './observed-at'

function findingId(scannerId: string, value: string): string {
  return createHash('sha1').update(`${scannerId}\n${value}`).digest('hex').slice(0, 16)
}

/** Categories whose unmatched findings describe the machine, not cheat evidence. */
const CONTEXT_CATEGORIES: ReadonlySet<FindingCategory> = new Set(['context', 'environment'])

/**
 * Classify raw scanner output into structured findings. A finding string is only
 * EVIDENCE — base severity comes from the scanner's policy, base confidence
 * starts LOW (a name match is a coincidence until corroborated).
 *
 * Two exceptions:
 *  - A file-hash finding tagged as a known-hash content match is strong
 *    evidence: category `hash`, verified, high confidence. A file-hash finding
 *    that is only a FILE-NAME keyword match is an ordinary `file` lead.
 *  - A context/environment finding with no keyword match (e.g. the Steam
 *    accounts present on the PC, "Steam not found") is informational: it is
 *    kept for the investigator but can never raise the verdict on its own.
 */
export function classifyFindings(
  results: ScanResult[],
  findKeyword: (value: string) => string | null
): AnalyzedFinding[] {
  const out: AnalyzedFinding[] = []
  for (const r of results) {
    if (!r.success) continue
    const scannerId = scannerIdFromDisplayName(r.scannerName)
    if (!scannerId) continue // defensive: unknown display name (should not occur)
    const policy = SCANNER_POLICY[scannerId] ?? DEFAULT_POLICY
    for (const value of r.findings) {
      const keyword = findKeyword(value)
      const isHash = policy.category === 'hash' && isKnownHashFinding(value)

      let category: FindingCategory = policy.category
      let severity: Severity = policy.baseSeverity
      if (policy.category === 'hash' && !isHash) {
        // Filename-only match from the hash scanner: a file lead, not a hash.
        category = 'file'
        severity = SCANNER_POLICY.appdata.baseSeverity
      } else if (!isHash && keyword === null && CONTEXT_CATEGORIES.has(category)) {
        severity = 'info'
      }

      const confidence: Confidence = isHash ? 'high' : 'low'
      out.push({
        id: findingId(scannerId, value),
        scannerId,
        value,
        category,
        // A hash match correlates on its keyword when the file name also
        // matches one, otherwise on the hash itself.
        matched: isHash ? (keyword ?? hashTokenOf(value) ?? value) : keyword,
        hashTrust: isHash ? 'verified' : undefined,
        severity,
        baseSeverity: severity,
        confidence,
        baseConfidence: confidence,
        correlationId: null,
        reasons: [],
        ...observedAtOf(value)
      })
    }
  }
  return out
}

/** `{ observedAt }` when the finding carries a time, else nothing (keeps JSON lean). */
function observedAtOf(value: string): { observedAt?: string } {
  const at = extractObservedAt(value)
  return at ? { observedAt: at } : {}
}

const SEVERITY_RANK: Record<Severity, number> = { critical: 4, high: 3, medium: 2, low: 1, info: 0 }
const CONFIDENCE_RANK: Record<Confidence, number> = { high: 2, medium: 1, low: 0 }

export function severityRank(s: Severity): number { return SEVERITY_RANK[s] }
export function confidenceRank(c: Confidence): number { return CONFIDENCE_RANK[c] }

function maxSeverity(a: Severity, b: Severity): Severity { return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b }
function maxConfidence(a: Confidence, b: Confidence): Confidence { return CONFIDENCE_RANK[a] >= CONFIDENCE_RANK[b] ? a : b }

function correlationId(signature: string): string {
  return 'corr-' + createHash('sha1').update(signature.toLowerCase()).digest('hex').slice(0, 8)
}

/**
 * Confidence is EARNED by corroboration. Findings sharing a signature across ≥2
 * distinct categories form a Correlation; strength = distinct category count.
 * strength 2 → medium confidence; strength ≥3 → high confidence + ≥high severity.
 * Operates on copies — the input array's elements are not mutated.
 */
export function correlate(
  input: AnalyzedFinding[]
): { findings: AnalyzedFinding[]; correlations: Correlation[] } {
  const findings = input.map(f => ({ ...f, reasons: [...f.reasons] }))
  const groups = new Map<string, AnalyzedFinding[]>()
  for (const f of findings) {
    if (!f.matched) continue
    const key = f.matched.toLowerCase()
    const arr = groups.get(key)
    if (arr) arr.push(f)
    else groups.set(key, [f])
  }

  const correlations: Correlation[] = []
  for (const members of groups.values()) {
    const categories = [...new Set(members.map(m => m.category))]
    if (categories.length < 2) continue
    const strength = categories.length
    const confidence: Confidence = strength >= 3 ? 'high' : 'medium'
    const severity: Severity = strength >= 3 ? 'high' : 'medium'
    const corr: Correlation = {
      id: correlationId(members[0].matched!),
      signature: members[0].matched!,
      categories,
      scannerIds: [...new Set(members.map(m => m.scannerId))],
      strength,
      severity,
      confidence
    }
    correlations.push(corr)
    for (const m of members) {
      const newSeverity = maxSeverity(m.severity, severity)
      const newConfidence = maxConfidence(m.confidence, confidence)
      if (newSeverity !== m.severity || newConfidence !== m.confidence) {
        m.reasons.push({
          code: 'corroboration',
          direction: 'up',
          text: `Corroborated across ${categories.join(', ')}`,
          signature: corr.signature,
          params: { categories: categories.join(', '), strength }
        })
      }
      m.correlationId = corr.id
      m.severity = newSeverity
      m.confidence = newConfidence
    }
  }
  return { findings, correlations }
}

const BAND_SCORE: Record<VerdictBand, number> = { clean: 0, low: 25, medium: 50, high: 72, critical: 92 }

/**
 * Conservative verdict: the band is raised ONLY by high-confidence (corroborated)
 * evidence. A lone match stays low. A verified hash escalates to critical alone;
 * a community hash is capped at medium unless other corroborating evidence exists.
 * `findings`/`correlations` are assumed already filtered to ACTIVE (non-suppressed).
 */
export function computeVerdict(findings: AnalyzedFinding[], correlations: Correlation[]): Verdict {
  const reasons: ScoreReason[] = []

  if (findings.length === 0) {
    reasons.push({ code: 'no-findings', direction: 'neutral', text: 'No findings' })
    return { score: 0, band: 'clean', rationale: 'No findings', reasons }
  }

  const hasVerifiedHash = findings.some(f => f.category === 'hash' && f.hashTrust === 'verified')
  const communityHashes = findings.filter(f => f.category === 'hash' && f.hashTrust === 'community')
  const strong3 = correlations.some(c => c.strength >= 3)
  const strong2 = correlations.some(c => c.strength >= 2)

  // A runtime/execution signature that also appears as a file finding.
  const fileSigs = new Set(findings.filter(f => f.category === 'file' && f.matched).map(f => f.matched!.toLowerCase()))
  const crossRuntimeFile = findings.some(
    f => (f.category === 'runtime' || f.category === 'execution') && f.matched && fileSigs.has(f.matched.toLowerCase())
  )
  // A community hash plus any other independent medium+ evidence.
  const communityHashCorroborated =
    communityHashes.length > 0 && findings.some(f => f.category !== 'hash' && severityRank(f.severity) >= 2)

  const distinctMediumSignatures = new Set(
    findings.filter(f => severityRank(f.baseSeverity) >= 2 && f.matched).map(f => f.matched!.toLowerCase())
  ).size

  const hasMeaningful = findings.some(f => severityRank(f.baseSeverity) >= 1) // exclude pure 'info'

  let band: VerdictBand
  if (hasVerifiedHash) {
    band = 'critical'
    reasons.push({ code: 'verified-hash', direction: 'up', text: 'A verified known-cheat file hash matched' })
  } else if (strong3) {
    band = 'critical'
    reasons.push({ code: 'strong-corroboration', direction: 'up', text: 'A signature was corroborated across 3+ artifact types' })
  } else if (strong2 || crossRuntimeFile || communityHashCorroborated) {
    band = 'high'
    reasons.push({ code: 'corroboration', direction: 'up', text: 'A signature was corroborated across multiple artifacts' })
  } else if (communityHashes.length > 0 || distinctMediumSignatures >= 3) {
    band = 'medium'
    reasons.push(communityHashes.length > 0
      ? { code: 'community-hash-uncorroborated', direction: 'neutral', text: 'An unverified (community) hash matched but is not corroborated' }
      : { code: 'multiple-leads', direction: 'neutral', text: 'Several independent leads, none corroborated' })
  } else if (hasMeaningful) {
    band = 'low'
    reasons.push({ code: 'lone-match', direction: 'neutral', text: 'An isolated keyword match — likely a coincidence until corroborated' })
  } else {
    band = 'clean'
    reasons.push({ code: 'environment-only', direction: 'neutral', text: 'Only environment/context signals, no cheat evidence' })
  }

  // Trace cleaning (cleared logs, wiped/disabled Prefetch, a cleaner run
  // before the check) is not cheat evidence in itself, but it means the other
  // checks may have been starved of data. It sets a floor on the band, and
  // cleaning on a machine that still carries cheat leads is escalated.
  const traceCleaning = findings.some(f => f.category === 'antiforensics')
  if (traceCleaning) {
    const hasLeads = findings.some(f => f.category !== 'antiforensics' && f.matched && f.severity !== 'info')
    const floor: VerdictBand = hasLeads ? 'high' : 'medium'
    const reason: ScoreReason = hasLeads
      ? { code: 'trace-cleaning-with-leads', direction: 'up', text: 'Traces were cleaned or tools blocked, and cheat leads remain' }
      : { code: 'trace-cleaning', direction: 'up', text: 'Signs that traces were removed or Windows tools were blocked before the check' }
    if (BAND_SCORE[floor] > BAND_SCORE[band]) {
      band = floor
      reasons.unshift(reason)
    } else {
      reasons.push(reason)
    }
  }

  return { score: BAND_SCORE[band], band, rationale: reasons[0].text, reasons }
}

export interface AnalyzeContext {
  scanId: string
  scannedAt: string            // ISO
  durationMs: number
  appVersion: string
  signatureVersion: string
  gameId: GameId | null
  os?: { name: string; version: string; arch: string; appArch: string }
  findKeyword: (value: string) => string | null
  suppression: SuppressionState
}

function sortFindings(findings: AnalyzedFinding[]): AnalyzedFinding[] {
  return [...findings].sort((a, b) =>
    severityRank(b.severity) - severityRank(a.severity) ||
    confidenceRank(b.confidence) - confidenceRank(a.confidence) ||
    a.scannerId.localeCompare(b.scannerId) ||
    a.value.localeCompare(b.value)
  )
}

/** Pure end-to-end analysis: classify → correlate → suppress → verdict → report. */
export function analyze(results: ScanResult[], ctx: AnalyzeContext): ScanReport {
  const classified = classifyFindings(results, ctx.findKeyword)
  const { findings, correlations } = correlate(classified)

  const whitelist = new Set(ctx.suppression.whitelistedSignatures.map(s => s.toLowerCase()))
  const dismissed = new Set(ctx.suppression.dismissedFindingIds)
  for (const f of findings) {
    if (f.matched && whitelist.has(f.matched.toLowerCase())) f.whitelisted = true
    if (dismissed.has(f.id)) f.dismissed = true
  }

  const active = findings.filter(f => !f.whitelisted && !f.dismissed)
  const activeCorrelations = correlations.filter(c => active.some(f => f.correlationId === c.id))
  const verdict = computeVerdict(active, activeCorrelations)

  // A verdict is only as good as the checks behind it. When scanners failed
  // (typically "access denied" without admin rights, or a timeout) say so, so
  // a "clean" result on a half-scanned machine is never taken at face value.
  const failed = results.filter(r => !r.success).length
  if (failed > 0) {
    verdict.reasons.push({
      code: 'incomplete-coverage',
      direction: 'neutral',
      text: `${failed} of ${results.length} checks did not complete — coverage is incomplete`,
      params: { failed, total: results.length }
    })
  }

  const scanners = results.map(r => ({
    id: (scannerIdFromDisplayName(r.scannerName) ?? (r.scannerName as ScannerName)),
    name: r.scannerName,
    success: r.success,
    error: r.error,
    durationMs: r.duration,
    count: r.findings.length
  }))

  const report: ScanReport = {
    id: ctx.scanId,
    meta: {
      appVersion: ctx.appVersion,
      engineVersion: RISK_ENGINE_VERSION,
      scannedAt: ctx.scannedAt,
      durationMs: ctx.durationMs,
      gameId: ctx.gameId,
      os: ctx.os,
      signatureVersion: ctx.signatureVersion
    },
    verdict,
    findings: sortFindings(findings),
    correlations,
    scanners
  }
  report.contentHash = reportContentHash(report)
  return report
}

/**
 * SHA-256 over the report's canonical JSON (everything except the hash
 * itself). Printed on exports so a report shared with other staff can be
 * checked for after-the-fact edits: re-hash the JSON and compare.
 */
export function reportContentHash(report: ScanReport): string {
  const { contentHash: _omit, ...body } = report
  return createHash('sha256').update(JSON.stringify(body)).digest('hex')
}
