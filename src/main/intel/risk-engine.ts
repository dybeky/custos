import { createHash } from 'crypto'
import type {
  ScanResult, AnalyzedFinding, HashTrust, Confidence, Correlation, Severity, ScoreReason
} from '../../shared/types'
import { scannerIdFromDisplayName } from '../../shared/scanners-meta'
import { SCANNER_POLICY, DEFAULT_POLICY } from './scanner-policy'

function findingId(scannerId: string, value: string): string {
  return createHash('sha1').update(`${scannerId}\n${value}`).digest('hex').slice(0, 16)
}

/**
 * Classify raw scanner output into structured findings. A finding string is only
 * EVIDENCE — base severity comes from the scanner's policy, base confidence
 * starts LOW (a name match is a coincidence until corroborated). A file-hash
 * finding is the exception: it is a content match, so it starts high-confidence.
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
    const isHash = policy.category === 'hash'
    for (const value of r.findings) {
      const hashTrust: HashTrust | undefined = isHash ? 'verified' : undefined
      const matched = isHash ? value : findKeyword(value)
      const baseConfidence: Confidence = isHash ? 'high' : 'low'
      out.push({
        id: findingId(scannerId, value),
        scannerId,
        value,
        category: policy.category,
        matched: matched ?? null,
        hashTrust,
        severity: policy.baseSeverity,
        baseSeverity: policy.baseSeverity,
        confidence: baseConfidence,
        baseConfidence,
        correlationId: null,
        reasons: []
      })
    }
  }
  return out
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
