/**
 * Pure parsing / filtering for the Windows Defender detection history.
 *
 * Source: the "Microsoft-Windows-Windows Defender/Operational" event log,
 * events 1116 (malware detected) and 1117 (action taken). Each carries the
 * threat name Microsoft assigned, the file path(s) and the detection time —
 * and outlives the file itself (deleted, quarantined or not).
 *
 * False-positive guard: Defender's "HackTool" family also covers Windows
 * activators (KMS), keygens and cracks, which are not cheats. Only threat
 * families that are specifically game cheats / cheat tooling are trusted on
 * their own; anything else must match the cheat keyword list by name or path.
 */

export interface DefenderDetection {
  threatName: string
  paths: string[]
  /** Epoch ms of the detection. */
  detectedAt: number
  action: string | null
}

/** Defender families that mean "game cheat / cheat tooling" by themselves. */
export const CHEAT_FAMILY =
  /\b(gamehack|gamecheat|cheatengine|cheat[._-]?engine|aimbot|wallhack|triggerbot|dllinject(or)?|xenos(injector)?|extremeinjector)\b/i

/** Families that are never cheats even though Defender files them as HackTool. */
export const NOT_A_CHEAT = /\b(autokms|kmspico|kmsauto|kms|keygen|crack|patcher|activator|winactivator)\b/i

/** XML text → plain text (wevtutil escapes &, <, >, quotes in paths and names). */
export function unescapeXml(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, e: string) => {
    const k = e.toLowerCase()
    if (k === 'amp') return '&'
    if (k === 'lt') return '<'
    if (k === 'gt') return '>'
    if (k === 'quot') return '"'
    if (k === 'apos') return "'"
    const code = k.startsWith('#x') ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10)
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m
  })
}

function field(eventXml: string, name: string): string | null {
  const re = new RegExp(`<Data Name=['"]${name}['"]>([^<]*)</Data>`, 'i')
  const m = re.exec(eventXml)
  return m ? unescapeXml(m[1]).trim() : null
}

/** "file:_C:\\a.exe;containerfile:_C:\\b.zip" → ["C:\\a.exe", "C:\\b.zip"]. */
export function parseDefenderPaths(raw: string | null): string[] {
  if (!raw) return []
  return raw
    .split(';')
    .map((p) => p.replace(/^[a-z]+:_/i, '').trim())
    .filter((p) => p.length > 0)
}

/** Parse wevtutil /f:xml output of Defender events into detections. */
export function parseDefenderEvents(xml: string): DefenderDetection[] {
  const out: DefenderDetection[] = []
  for (const ev of xml.split(/<\/Event>/i)) {
    const threatName = field(ev, 'Threat Name')
    if (!threatName) continue
    const when = field(ev, 'Detection Time') ?? /<TimeCreated\s+SystemTime=['"]([^'"]+)['"]/.exec(ev)?.[1] ?? null
    const detectedAt = when ? Date.parse(when) : NaN
    if (Number.isNaN(detectedAt)) continue
    out.push({ threatName, paths: parseDefenderPaths(field(ev, 'Path')), detectedAt, action: field(ev, 'Action Name') })
  }
  return out
}

export type DefenderRelevance = 'cheat-family' | 'keyword' | null

/** Why a detection matters for a cheat check, or null to ignore it. */
export function defenderRelevance(d: DefenderDetection, containsKeyword: (s: string) => boolean): DefenderRelevance {
  if (NOT_A_CHEAT.test(d.threatName)) {
    // An activator/keygen is only interesting if its file is named like a cheat.
    return d.paths.some(containsKeyword) ? 'keyword' : null
  }
  if (CHEAT_FAMILY.test(d.threatName)) return 'cheat-family'
  if (containsKeyword(d.threatName) || d.paths.some(containsKeyword)) return 'keyword'
  return null
}

/**
 * Merge 1116/1117 pairs and repeats: one entry per (threat, first path),
 * keeping the latest time and the last known action.
 */
export function dedupeDetections(list: DefenderDetection[]): DefenderDetection[] {
  const byKey = new Map<string, DefenderDetection>()
  for (const d of list) {
    const key = `${d.threatName.toLowerCase()}|${(d.paths[0] ?? '').toLowerCase()}`
    const prev = byKey.get(key)
    if (!prev) {
      byKey.set(key, { ...d })
    } else {
      if (d.detectedAt >= prev.detectedAt) {
        prev.detectedAt = d.detectedAt
        prev.action = d.action ?? prev.action
      }
      prev.paths = [...new Set([...prev.paths, ...d.paths])]
    }
  }
  return [...byKey.values()].sort((a, b) => b.detectedAt - a.detectedAt)
}
