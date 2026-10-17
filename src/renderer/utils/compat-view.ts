import type { CapabilityCategory, ScannerCapability } from '../../shared/types'

// Render order + i18n label key for each app-area group.
export const CATEGORY_ORDER: { id: CapabilityCategory; labelKey: string }[] = [
  { id: 'scan', labelKey: 'dashboard.categoryScan' },
  { id: 'manual', labelKey: 'dashboard.categoryManual' },
  { id: 'utilities', labelKey: 'dashboard.categoryUtilities' },
  { id: 'export', labelKey: 'dashboard.categoryExport' }
]

/** A group longer than this shows a preview with a "show all" toggle. */
export const PREVIEW_LIMIT = 8

export interface CapabilityGroup {
  id: CapabilityCategory
  labelKey: string
  items: ScannerCapability[]
  ready: number
}

/**
 * Group capabilities by app area in CATEGORY_ORDER, dropping empty groups.
 * Inside a group, supported checks come first.
 */
export function groupCapabilities(capabilities: ScannerCapability[]): CapabilityGroup[] {
  return CATEGORY_ORDER.map(({ id, labelKey }) => {
    const items = capabilities
      .filter((c) => c.category === id)
      .sort((a, b) => Number(b.supported) - Number(a.supported))
    return { id, labelKey, items, ready: items.filter((c) => c.supported).length }
  }).filter((g) => g.items.length > 0)
}

/** Items to show for a group; a preview never hides an unavailable check. */
export function visibleItems(
  items: ScannerCapability[],
  expanded: boolean,
  limit = PREVIEW_LIMIT
): ScannerCapability[] {
  if (expanded || items.length <= limit) return items
  return items.filter((c, i) => i < limit || !c.supported)
}

export type CompatTone = 'ok' | 'partial' | 'none'

export function compatTone(supported: number, total: number): CompatTone {
  if (total > 0 && supported === total) return 'ok'
  return supported > 0 ? 'partial' : 'none'
}

export interface UnavailableReason {
  reasonKey?: ScannerCapability['reasonKey']
  reasonParams?: ScannerCapability['reasonParams']
  /** English fallback text of the reason. */
  reason: string
  count: number
}

/** Distinct reasons why checks are unavailable, with how many checks each affects. */
export function unavailableReasons(capabilities: ScannerCapability[]): UnavailableReason[] {
  const byKey = new Map<string, UnavailableReason>()
  for (const c of capabilities) {
    if (c.supported) continue
    const key = `${c.reasonKey ?? ''}|${c.reason ?? ''}`
    const found = byKey.get(key)
    if (found) found.count += 1
    else
      byKey.set(key, {
        reasonKey: c.reasonKey,
        reasonParams: c.reasonParams,
        reason: c.reason ?? '',
        count: 1
      })
  }
  return [...byKey.values()].sort((a, b) => b.count - a.count)
}

// ---- The read-out played when the card appears: the checks are "read" one after another.

/** The whole pass lasts 1.5-2.5 s; more checks take a little longer, never more. */
export function readoutDurationMs(count: number): number {
  return Math.min(2500, Math.max(1500, 1000 + Math.max(0, count) * 40))
}

/** Eased progress (0-1, monotonic) after `elapsedMs` of a pass lasting `durationMs`. */
export function readoutProgress(elapsedMs: number, durationMs: number): number {
  if (!Number.isFinite(elapsedMs) || !(durationMs > 0)) return 1
  const x = Math.min(1, Math.max(0, elapsedMs / durationMs))
  return 0.5 - Math.cos(Math.PI * x) / 2
}

/** How many checks have been read at `progress`; all of them once it reaches 1. */
export function readoutChecked(progress: number, count: number): number {
  if (count <= 0) return 0
  if (progress >= 1) return count
  return Math.min(count, Math.max(0, Math.floor(progress * count)))
}

export type ReadoutState = 'pending' | 'scanning' | 'checked'

/** A check's state during the pass: the one being read right now is "scanning". */
export function readoutState(index: number, checked: number, count: number): ReadoutState {
  if (index < checked) return 'checked'
  return index === checked && checked < count ? 'scanning' : 'pending'
}

/** The checks in the order the groups show them. */
export function readoutOrder(groups: CapabilityGroup[]): ScannerCapability[] {
  return groups.flatMap((g) => g.items)
}

/** Available checks among the first `checked` ones: what the ring shows while it fills. */
export function readoutAvailable(order: ScannerCapability[], checked: number): number {
  let n = 0
  for (let i = 0; i < Math.min(checked, order.length); i++) if (order[i].supported) n++
  return n
}
