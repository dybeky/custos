import type { ScannerName, FindingCategory, Severity } from '../../shared/types'

/** Bump when scoring logic changes, so history/diff stays comparable across versions. */
export const RISK_ENGINE_VERSION = '1.0.0'

export interface ScannerPolicy {
  category: FindingCategory
  baseSeverity: Severity
}

/** Category + base severity (impact-if-real) per scanner. Confidence is earned separately. */
export const SCANNER_POLICY: Record<ScannerName, ScannerPolicy> = {
  filehash: { category: 'hash', baseSeverity: 'critical' },
  bam: { category: 'execution', baseSeverity: 'high' },
  amcache: { category: 'execution', baseSeverity: 'high' },
  prefetch: { category: 'execution', baseSeverity: 'high' },
  process: { category: 'runtime', baseSeverity: 'high' },
  windowmodule: { category: 'runtime', baseSeverity: 'high' },
  scheduledtasks: { category: 'persistence', baseSeverity: 'high' },
  registry: { category: 'registry', baseSeverity: 'medium' },
  appdata: { category: 'file', baseSeverity: 'medium' },
  gamefolder: { category: 'file', baseSeverity: 'medium' },
  recentfiles: { category: 'file', baseSeverity: 'medium' },
  browserhistory: { category: 'network', baseSeverity: 'medium' },
  dnscache: { category: 'network', baseSeverity: 'medium' },
  steam: { category: 'context', baseSeverity: 'low' },
  shellbags: { category: 'context', baseSeverity: 'low' },
  vm: { category: 'environment', baseSeverity: 'info' }
}

/** Used when a scanner display name cannot be resolved (defensive; should not occur). */
export const DEFAULT_POLICY: ScannerPolicy = { category: 'context', baseSeverity: 'low' }
