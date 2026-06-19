import { createHash } from 'crypto'
import type {
  ScanResult, AnalyzedFinding, HashTrust, Confidence
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
