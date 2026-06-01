/**
 * Loads and validates `resources/signatures.json` with Zod.
 *
 * Schema:
 *   aob            — array of AOB (byte-pattern) signatures for detector #1
 *   moduleAllowlist — known-good module names (lowercased)
 *   moduleDenylist  — known-bad module names (lowercased)
 *
 * Falls back to a safe default (empty aob + denylist; standard allowlist) if
 * the file is missing or fails validation.
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import { z } from 'zod'

// ── Zod schemas ──────────────────────────────────────────────────────────────

const AobSignatureSchema = z.object({
  name: z.string().min(1),
  pattern: z.string().min(1),
  module: z.string().optional()
})

const SignaturesSchema = z.object({
  aob: z.array(AobSignatureSchema),
  moduleAllowlist: z.array(z.string()),
  moduleDenylist: z.array(z.string())
})

export type AobSignature = z.infer<typeof AobSignatureSchema>
export type Signatures = z.infer<typeof SignaturesSchema>

// ── Default allowlist ────────────────────────────────────────────────────────

const DEFAULT_ALLOWLIST: string[] = [
  'unturned.exe',
  'unityplayer.dll',
  'mono-2.0-bdwgc.dll',
  'gameoverlayrenderer64.dll',
  'gameoverlayrenderer.dll',
  'steam_api64.dll',
  'steam_api.dll',
  'ntdll.dll',
  'kernel32.dll',
  'kernelbase.dll',
  'user32.dll',
  'win32u.dll',
  'gdi32.dll',
  'gdi32full.dll',
  'msvcrt.dll',
  'sechost.dll',
  'rpcrt4.dll',
  'combase.dll',
  'ucrtbase.dll',
  'msvcp_win.dll',
  'bcryptprimitives.dll',
  'advapi32.dll',
  'ole32.dll',
  'oleaut32.dll',
  'shlwapi.dll',
  'shell32.dll',
  'winmm.dll',
  'version.dll',
  'opengl32.dll',
  'd3d11.dll',
  'd3d12.dll',
  'dxgi.dll',
  'ws2_32.dll',
  'winhttp.dll',
  'crypt32.dll',
  'dbghelp.dll',
]

const DEFAULT_SIGNATURES: Signatures = {
  aob: [],
  moduleAllowlist: DEFAULT_ALLOWLIST,
  moduleDenylist: []
}

// ── Loader ───────────────────────────────────────────────────────────────────

let _cached: Signatures | undefined

/**
 * Load signatures from `resources/signatures.json`.
 * All names in allowlist / denylist are lowercased on load.
 * Falls back to DEFAULT_SIGNATURES on any error.
 */
export function loadSignatures(resourcesPath?: string): Signatures {
  if (_cached) return _cached

  try {
    const dir = resourcesPath ?? join(__dirname, '..', '..', '..', 'resources')
    const raw = readFileSync(join(dir, 'signatures.json'), 'utf-8')
    const parsed = SignaturesSchema.parse(JSON.parse(raw))

    _cached = {
      aob: parsed.aob,
      moduleAllowlist: parsed.moduleAllowlist.map(n => n.toLowerCase()),
      moduleDenylist: parsed.moduleDenylist.map(n => n.toLowerCase())
    }
  } catch {
    _cached = DEFAULT_SIGNATURES
  }

  return _cached
}

/**
 * Parse a hex AOB string (e.g. "48 8B ?? 00") into an array of byte values /
 * null for wildcards. Returns null if the pattern string is invalid.
 *
 * This is a pure function with no native dependency — unit-testable.
 */
export function parseAobPattern(pattern: string): (number | null)[] | null {
  const tokens = pattern.trim().split(/\s+/)
  if (tokens.length === 0) return null

  const bytes: (number | null)[] = []
  for (const token of tokens) {
    if (token === '??' || token === '?') {
      bytes.push(null)
    } else {
      const val = parseInt(token, 16)
      if (isNaN(val) || val < 0 || val > 0xff) return null
      bytes.push(val)
    }
  }
  return bytes.length > 0 ? bytes : null
}

/** Reset the cache (used by tests). */
export function _resetSignatureCache(): void {
  _cached = undefined
}
