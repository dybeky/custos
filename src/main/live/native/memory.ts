/**
 * Lazy, guarded wrapper over `memoryjs`.
 *
 * memoryjs is a Windows-only prebuilt native addon. On any other platform
 * (macOS, Linux) `require('memoryjs')` throws "Cannot find module
 * './build/Release/memoryjs'" because the native binary is never built.
 *
 * All exports follow one rule: **never throw across the boundary**. Functions
 * return null / empty arrays when the native layer is unavailable.
 */

import type { Process, Module, Region, PatternResult } from 'memoryjs'

// Re-export shapes so callers can type-check without importing memoryjs directly.
export type { Process, Module, Region, PatternResult }

// ── Lazy loader ──────────────────────────────────────────────────────────────

let _cached: typeof import('memoryjs') | null | undefined = undefined

/**
 * Try to load memoryjs exactly once. Returns null when unavailable (non-Windows
 * or native addon not built for this Electron ABI).
 */
function loadMemoryjs(): typeof import('memoryjs') | null {
  if (_cached !== undefined) return _cached

  if (process.platform !== 'win32') {
    _cached = null
    return null
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _cached = require('memoryjs') as typeof import('memoryjs')
  } catch {
    _cached = null
  }
  return _cached
}

// ── Public capability flag ───────────────────────────────────────────────────

/**
 * True only when memoryjs successfully loaded (Windows + correct Electron ABI).
 */
export function isMemoryNativeAvailable(): boolean {
  return loadMemoryjs() !== null
}

// ── Thin typed wrappers ──────────────────────────────────────────────────────

/**
 * Open a handle to the game process by PID.
 * Returns null when native is unavailable.
 */
export function openGameProcess(pid: number): Process | null {
  if (process.platform !== 'win32') return null
  const m = loadMemoryjs()
  if (!m) return null
  try {
    return m.openProcess(pid)
  } catch {
    return null
  }
}

/**
 * List all running processes.
 * Returns an empty array when native is unavailable.
 */
export function listProcesses(): Process[] {
  if (process.platform !== 'win32') return []
  const m = loadMemoryjs()
  if (!m) return []
  try {
    return m.getProcesses()
  } catch {
    return []
  }
}

/**
 * List modules loaded in the specified process (by PID).
 * Returns an empty array when native is unavailable.
 */
export function listModules(pid: number): Module[] {
  if (process.platform !== 'win32') return []
  const m = loadMemoryjs()
  if (!m) return []
  try {
    return m.getModules(pid)
  } catch {
    return []
  }
}

/**
 * Enumerate virtual-memory regions in the process (by handle).
 * Returns an empty array when native is unavailable.
 */
export function listRegions(handle: number): Region[] {
  if (process.platform !== 'win32') return []
  const m = loadMemoryjs()
  if (!m) return []
  try {
    return m.getRegions(handle)
  } catch {
    return []
  }
}

/**
 * Build the argument list for memoryjs.findPattern. memoryjs dispatches by arity:
 * 5 args (handle, module, pattern, flags, offset) → findPatternByModule;
 * 4 args (handle, pattern, flags, offset) → findPattern over all committed memory.
 * Passing an empty module string to the 5-arg form searches a module named "" and
 * never matches — so module-less signatures must use the 4-arg overload.
 */
export function findPatternArgs(
  handle: number, module: string, pattern: string, flags: number, offset: number
): unknown[] {
  return module
    ? [handle, module, pattern, flags, offset]
    : [handle, pattern, flags, offset]
}

/**
 * AOB scan within the specified module (or all memory when module is "").
 * Returns null when native is unavailable or the scan throws.
 */
export function scanPattern(
  handle: number,
  module: string,
  pattern: string,
  flags = 0,
  offset = 0
): PatternResult | null {
  if (process.platform !== 'win32') return null
  const m = loadMemoryjs()
  if (!m) return null
  try {
    const fn = m.findPattern as (...a: unknown[]) => PatternResult
    return fn(...findPatternArgs(handle, module, pattern, flags, offset))
  } catch {
    return null
  }
}

/**
 * Close a process handle previously obtained from openGameProcess().
 * Safe to call when native is unavailable.
 */
export function close(handle: number): void {
  if (process.platform !== 'win32') return
  const m = loadMemoryjs()
  if (!m) return
  try {
    m.closeHandle(handle)
  } catch {
    // Ignore close errors
  }
}

/**
 * Page-protection constants from memoryjs / Win32.
 * These are exported as static values so pure logic (isSuspiciousRegion etc.)
 * can reference them without touching the native module at all.
 */
export const EXEC_PROTECTIONS = new Set<number>([
  0x10, // PAGE_EXECUTE
  0x20, // PAGE_EXECUTE_READ
  0x40, // PAGE_EXECUTE_READWRITE
  0x80, // PAGE_EXECUTE_WRITECOPY
])

/** Win32 MEM_PRIVATE type constant */
export const MEM_PRIVATE = 0x20000

/**
 * Read `size` bytes from the process at `address`.
 * Returns null when native is unavailable or the read throws.
 *
 * CAVEAT: memoryjs.readBuffer does NOT signal a failed ReadProcessMemory — on
 * failure it returns a `size`-length Buffer of *uninitialised process heap*
 * rather than null. A non-null result therefore does NOT prove the read
 * succeeded. Callers must independently confirm the address is mapped/readable
 * in the target (e.g. it falls inside a module known to be loaded there) before
 * trusting the bytes.
 */
export function readBuffer(handle: number, address: number, size: number): Buffer | null {
  if (process.platform !== 'win32') return null
  const m = loadMemoryjs()
  if (!m) return null
  try {
    return m.readBuffer(handle, address, size)
  } catch {
    return null
  }
}
