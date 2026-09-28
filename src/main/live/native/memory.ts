/**
 * Process-memory access for the live detectors, over koffi (Win32 FFI).
 *
 * This used to wrap `memoryjs`, a native addon that has to be compiled from
 * source with Visual Studio build tools. When that failed — as it silently did
 * in release builds — the optional dependency was dropped and Live Scan
 * reported "native module not available". koffi ships prebuilt binaries for
 * win32 x64 and arm64, so this layer now works in every build.
 *
 * All exports follow one rule: **never throw across the boundary**. Functions
 * return null / empty arrays when the native layer is unavailable or a call
 * fails. Handles are plain numbers (Win32 HANDLE values).
 */

import type { LibraryHandle } from 'koffi'
import { parseAobPattern } from '../signatures'

type KoffiFunction = ReturnType<LibraryHandle['func']>

// ── Shapes (field names kept from the memoryjs era the detectors were built on) ─

export interface Process {
  th32ProcessID: number
  szExeFile: string
  /** OS handle — only set by openGameProcess() */
  handle: number
}

export interface Module {
  modBaseAddr: number
  modBaseSize: number
  szExePath: string
  szModule: string
}

export interface Region {
  BaseAddress: number
  AllocationBase: number
  AllocationProtect: number
  RegionSize: number
  State: number
  Protect: number
  Type: number
}

export interface PatternResult {
  /** Address of the first match; 0 when not found */
  address: number
  /** False when the scan was cut short (unreadable memory, size cap) */
  complete: boolean
}

// ── Win32 constants ──────────────────────────────────────────────────────────

const TH32CS_SNAPPROCESS = 0x2
const TH32CS_SNAPMODULE = 0x8
const TH32CS_SNAPMODULE32 = 0x10
const PROCESS_VM_READ = 0x0010
const PROCESS_QUERY_INFORMATION = 0x0400
const MEM_COMMIT = 0x1000
const PAGE_NOACCESS = 0x01
const PAGE_GUARD = 0x100
const INVALID_HANDLE = -1
const ERROR_BAD_LENGTH = 24

/** Page protections that allow execution. */
export const EXEC_PROTECTIONS = new Set<number>([
  0x10, // PAGE_EXECUTE
  0x20, // PAGE_EXECUTE_READ
  0x40, // PAGE_EXECUTE_READWRITE
  0x80 // PAGE_EXECUTE_WRITECOPY
])

/** Win32 MEM_PRIVATE type constant */
export const MEM_PRIVATE = 0x20000

// ── Lazy koffi binding ───────────────────────────────────────────────────────

interface Api {
  koffi: typeof import('koffi')
  CreateToolhelp32Snapshot: KoffiFunction
  Process32FirstW: KoffiFunction
  Process32NextW: KoffiFunction
  Module32FirstW: KoffiFunction
  Module32NextW: KoffiFunction
  OpenProcess: KoffiFunction
  CloseHandle: KoffiFunction
  GetProcessId: KoffiFunction
  GetLastError: KoffiFunction
  ReadProcessMemory: KoffiFunction
  VirtualQueryEx: KoffiFunction
  PROCESSENTRY32W: unknown
  MODULEENTRY32W: unknown
  MEMORY_BASIC_INFORMATION: unknown
}

let _api: Api | null | undefined
let _loadError: unknown = null

function api(): Api | null {
  if (_api !== undefined) return _api
  _api = null
  if (process.platform !== 'win32') return null
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const koffi = require('koffi') as typeof import('koffi')
    const k = koffi.load('kernel32.dll')
    const PROCESSENTRY32W = koffi.struct('CUSTOS_PROCESSENTRY32W', {
      dwSize: 'uint32', cntUsage: 'uint32', th32ProcessID: 'uint32', th32DefaultHeapID: 'uintptr',
      th32ModuleID: 'uint32', cntThreads: 'uint32', th32ParentProcessID: 'uint32',
      pcPriClassBase: 'int32', dwFlags: 'uint32', szExeFile: koffi.array('char16', 260, 'String')
    })
    const MODULEENTRY32W = koffi.struct('CUSTOS_MODULEENTRY32W', {
      dwSize: 'uint32', th32ModuleID: 'uint32', th32ProcessID: 'uint32', GlblcntUsage: 'uint32',
      ProccntUsage: 'uint32', modBaseAddr: 'uintptr', modBaseSize: 'uint32', hModule: 'uintptr',
      szModule: koffi.array('char16', 256, 'String'), szExePath: koffi.array('char16', 260, 'String')
    })
    const MEMORY_BASIC_INFORMATION = koffi.struct('CUSTOS_MEMORY_BASIC_INFORMATION', {
      BaseAddress: 'uintptr', AllocationBase: 'uintptr', AllocationProtect: 'uint32',
      PartitionId: 'uint16', RegionSize: 'uintptr', State: 'uint32', Protect: 'uint32', Type: 'uint32'
    })
    _api = {
      koffi,
      CreateToolhelp32Snapshot: k.func('intptr __stdcall CreateToolhelp32Snapshot(uint32 flags, uint32 pid)'),
      Process32FirstW: k.func('int __stdcall Process32FirstW(intptr snap, _Inout_ CUSTOS_PROCESSENTRY32W *pe)'),
      Process32NextW: k.func('int __stdcall Process32NextW(intptr snap, _Inout_ CUSTOS_PROCESSENTRY32W *pe)'),
      Module32FirstW: k.func('int __stdcall Module32FirstW(intptr snap, _Inout_ CUSTOS_MODULEENTRY32W *me)'),
      Module32NextW: k.func('int __stdcall Module32NextW(intptr snap, _Inout_ CUSTOS_MODULEENTRY32W *me)'),
      OpenProcess: k.func('intptr __stdcall OpenProcess(uint32 access, int inherit, uint32 pid)'),
      CloseHandle: k.func('int __stdcall CloseHandle(intptr h)'),
      GetProcessId: k.func('uint32 __stdcall GetProcessId(intptr h)'),
      GetLastError: k.func('uint32 __stdcall GetLastError()'),
      ReadProcessMemory: k.func('int __stdcall ReadProcessMemory(intptr h, uintptr addr, _Out_ uint8 *buf, uintptr size, _Out_ uintptr *read)'),
      VirtualQueryEx: k.func('uintptr __stdcall VirtualQueryEx(intptr h, uintptr addr, _Out_ CUSTOS_MEMORY_BASIC_INFORMATION *mbi, uintptr len)'),
      PROCESSENTRY32W,
      MODULEENTRY32W,
      MEMORY_BASIC_INFORMATION
    }
  } catch (err) {
    _loadError = err
    _api = null
  }
  return _api
}

const num = (v: unknown): number => (typeof v === 'bigint' ? Number(v) : Number(v ?? 0))

/** The error the native layer failed to load with on Windows (null if it loaded). */
export function getMemoryNativeLoadError(): unknown {
  api()
  return _loadError
}

/** True when the Win32 memory API is usable (Windows + koffi loaded). */
export function isMemoryNativeAvailable(): boolean {
  return api() !== null
}

// ── Processes & modules ──────────────────────────────────────────────────────

/** Walk a Toolhelp snapshot; `first`/`next` fill `entry` in place. */
function walkSnapshot<T>(
  a: Api, flags: number, pid: number, struct: unknown,
  first: KoffiFunction, next: KoffiFunction, map: (e: Record<string, unknown>) => T
): T[] {
  // A module snapshot can fail with ERROR_BAD_LENGTH while the target is
  // loading/unloading modules — MSDN says to retry.
  let snap = INVALID_HANDLE
  for (let i = 0; i < 5 && snap === INVALID_HANDLE; i++) {
    snap = num(a.CreateToolhelp32Snapshot(flags, pid))
    if (snap === INVALID_HANDLE && num(a.GetLastError()) !== ERROR_BAD_LENGTH) break
  }
  if (snap === INVALID_HANDLE || snap === 0) return []
  const out: T[] = []
  try {
    const entry: Record<string, unknown> = { dwSize: a.koffi.sizeof(struct as never) }
    let ok = num(first(snap, entry))
    while (ok) {
      out.push(map(entry))
      ok = num(next(snap, entry))
    }
  } finally {
    a.CloseHandle(snap)
  }
  return out
}

/** List all running processes. [] when unavailable. */
export function listProcesses(): Process[] {
  const a = api()
  if (!a) return []
  try {
    return walkSnapshot(a, TH32CS_SNAPPROCESS, 0, a.PROCESSENTRY32W, a.Process32FirstW, a.Process32NextW, (e) => ({
      th32ProcessID: num(e.th32ProcessID),
      szExeFile: String(e.szExeFile ?? ''),
      handle: 0
    }))
  } catch {
    return []
  }
}

/** List modules loaded in a process (by PID). [] when unavailable. */
export function listModules(pid: number): Module[] {
  const a = api()
  if (!a) return []
  try {
    return walkSnapshot(a, TH32CS_SNAPMODULE | TH32CS_SNAPMODULE32, pid, a.MODULEENTRY32W, a.Module32FirstW, a.Module32NextW, (e) => ({
      modBaseAddr: num(e.modBaseAddr),
      modBaseSize: num(e.modBaseSize),
      szModule: String(e.szModule ?? ''),
      szExePath: String(e.szExePath ?? '')
    }))
  } catch {
    return []
  }
}

/** Open the game process for reading. Null when unavailable or access is denied. */
export function openGameProcess(pid: number): Process | null {
  const a = api()
  if (!a) return null
  try {
    const handle = num(a.OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, 0, pid))
    if (!handle) return null
    const name = listProcesses().find((p) => p.th32ProcessID === pid)?.szExeFile ?? ''
    return { th32ProcessID: pid, szExeFile: name, handle }
  } catch {
    return null
  }
}

/** Close a handle from openGameProcess(). Safe when unavailable. */
export function close(handle: number): void {
  const a = api()
  if (!a || !handle) return
  try {
    a.CloseHandle(handle)
  } catch {
    // ignore
  }
}

// ── Memory ───────────────────────────────────────────────────────────────────

/** Enumerate the process's virtual-memory regions (VirtualQueryEx walk). */
export function listRegions(handle: number): Region[] {
  const a = api()
  if (!a || !handle) return []
  const out: Region[] = []
  const size = a.koffi.sizeof(a.MEMORY_BASIC_INFORMATION as never)
  let addr = 0
  try {
    // The cap bounds a runaway walk; real processes have a few thousand regions.
    for (let i = 0; i < 200_000; i++) {
      const mbi: Record<string, unknown> = {}
      if (!num(a.VirtualQueryEx(handle, addr, mbi, size))) break
      const region: Region = {
        BaseAddress: num(mbi.BaseAddress),
        AllocationBase: num(mbi.AllocationBase),
        AllocationProtect: num(mbi.AllocationProtect),
        RegionSize: num(mbi.RegionSize),
        State: num(mbi.State),
        Protect: num(mbi.Protect),
        Type: num(mbi.Type)
      }
      out.push(region)
      const nextAddr = region.BaseAddress + region.RegionSize
      if (region.RegionSize <= 0 || nextAddr <= addr) break
      addr = nextAddr
    }
  } catch {
    // return what we have
  }
  return out
}

/**
 * Read `size` bytes at `address`. Null when the read fails or is partial —
 * unlike memoryjs, a non-null result means the bytes really came from the target.
 */
export function readBuffer(handle: number, address: number, size: number): Buffer | null {
  const a = api()
  if (!a || !handle || size <= 0) return null
  try {
    const buf = Buffer.alloc(size)
    const read = [0]
    const ok = num(a.ReadProcessMemory(handle, address, buf, size, read))
    if (!ok || num(read[0]) !== size) return null
    return buf
  } catch {
    return null
  }
}

/**
 * Index of the first match of `pattern` (bytes, null = wildcard) in `buf`, or
 * -1. Pure — the AOB scan's inner loop, tested directly.
 */
export function findPatternIn(buf: Uint8Array, pattern: ReadonlyArray<number | null>): number {
  const n = pattern.length
  if (n === 0 || buf.length < n) return -1
  // Anchor on the first concrete byte to skip most positions quickly.
  const anchor = pattern.findIndex((b) => b !== null)
  if (anchor === -1) return 0
  const anchorByte = pattern[anchor] as number
  for (let i = anchor; i <= buf.length - n + anchor; i++) {
    if (buf[i] !== anchorByte) continue
    const start = i - anchor
    let ok = true
    for (let j = 0; j < n; j++) {
      const p = pattern[j]
      if (p !== null && buf[start + j] !== p) { ok = false; break }
    }
    if (ok) return start
  }
  return -1
}

const CHUNK = 4 * 1024 * 1024
/** Upper bound on bytes one all-memory scan will read (keeps a check responsive). */
const MAX_SCAN_BYTES = 1024 * 1024 * 1024

function isReadable(r: Region): boolean {
  return r.State === MEM_COMMIT && r.Protect !== 0 && (r.Protect & PAGE_NOACCESS) === 0 && (r.Protect & PAGE_GUARD) === 0
}

/** Scan [base, base+size) chunk by chunk, overlapping so a match can't straddle a boundary. */
function scanRange(
  handle: number, base: number, size: number, bytes: (number | null)[], budget: { left: number }
): { address: number; complete: boolean } {
  let complete = true
  const overlap = bytes.length - 1
  for (let off = 0; off < size; off += CHUNK) {
    const len = Math.min(CHUNK + overlap, size - off)
    if (budget.left <= 0) return { address: 0, complete: false }
    budget.left -= len
    const buf = readBuffer(handle, base + off, len)
    if (!buf) { complete = false; continue }
    const at = findPatternIn(buf, bytes)
    if (at >= 0) return { address: base + off + at, complete: true }
  }
  return { address: 0, complete }
}

/**
 * AOB scan: within `module` when named, otherwise across every committed,
 * readable region. Pattern: hex bytes with ?? wildcards ("48 8B ?? 05").
 * `offset` is added to a found address. Null when unavailable or invalid.
 */
export function scanPattern(handle: number, module: string, pattern: string, _flags = 0, offset = 0): PatternResult | null {
  const a = api()
  if (!a || !handle) return null
  const bytes = parseAobPattern(pattern)
  if (!bytes) return null
  try {
    const budget = { left: MAX_SCAN_BYTES }
    if (module) {
      const pid = num(a.GetProcessId(handle))
      const mod = listModules(pid).find((m) => m.szModule.toLowerCase() === module.toLowerCase())
      if (!mod) return { address: 0, complete: true }
      const r = scanRange(handle, mod.modBaseAddr, mod.modBaseSize, bytes, budget)
      return { address: r.address ? r.address + offset : 0, complete: r.complete }
    }
    let complete = true
    for (const region of listRegions(handle)) {
      if (!isReadable(region)) continue
      const r = scanRange(handle, region.BaseAddress, region.RegionSize, bytes, budget)
      if (r.address) return { address: r.address + offset, complete: true }
      if (!r.complete) complete = false
    }
    return { address: 0, complete }
  } catch {
    return null
  }
}
