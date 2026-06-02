/**
 * koffi wrappers for Win32 APIs used by the self-integrity detector and the
 * thread start-address detector.
 *
 * koffi loads on macOS but its Win32 DLL calls obviously only work on Windows.
 * All functions degrade gracefully (return false / null / []) on non-Windows or
 * when koffi fails to load.
 */

import type { LibraryHandle } from 'koffi'
import { toPtr } from './ptr'

// KoffiFunction is the return type of LibraryHandle.func()
type KoffiFunction = ReturnType<LibraryHandle['func']>

// ── Lazy koffi loader ────────────────────────────────────────────────────────

let _koffiLoaded = false
let _koffi: typeof import('koffi') | null = null

function loadKoffi(): typeof import('koffi') | null {
  if (_koffiLoaded) return _koffi
  _koffiLoaded = true
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _koffi = require('koffi') as typeof import('koffi')
  } catch {
    _koffi = null
  }
  return _koffi
}

// ── Lazy kernel32 binding ────────────────────────────────────────────────────

interface Kernel32Funcs {
  IsDebuggerPresent: KoffiFunction
  GetCurrentProcess: KoffiFunction
  CheckRemoteDebuggerPresent: KoffiFunction
}

let _k32Loaded = false
let _kernel32: Kernel32Funcs | null = null

function loadKernel32(): Kernel32Funcs | null {
  if (_k32Loaded) return _kernel32
  _k32Loaded = true

  if (process.platform !== 'win32') return null

  const koffi = loadKoffi()
  if (!koffi) return null

  try {
    const lib = koffi.load('kernel32.dll')
    _kernel32 = {
      IsDebuggerPresent: lib.func('int __stdcall IsDebuggerPresent()'),
      GetCurrentProcess: lib.func('void * __stdcall GetCurrentProcess()'),
      CheckRemoteDebuggerPresent: lib.func(
        'int __stdcall CheckRemoteDebuggerPresent(void *hProcess, _Out_ int *pbDebuggerPresent)'
      )
    }
  } catch {
    _kernel32 = null
  }
  return _kernel32
}

// ── Export-address resolution (inline-hook detector) ─────────────────────────

interface ProcApi {
  GetModuleHandleA: KoffiFunction
  GetProcAddress: KoffiFunction
}

let _procApiLoaded = false
let _procApi: ProcApi | null = null

function loadProcApi(): ProcApi | null {
  if (_procApiLoaded) return _procApi
  _procApiLoaded = true
  if (process.platform !== 'win32') return null
  const koffi = loadKoffi()
  if (!koffi) return null
  try {
    const k = koffi.load('kernel32.dll')
    _procApi = {
      GetModuleHandleA: k.func('void * __stdcall GetModuleHandleA(const char *name)'),
      // koffi can read the returned function pointer as a uint64 address.
      GetProcAddress: k.func('uint64 __stdcall GetProcAddress(void *mod, const char *name)')
    }
  } catch {
    _procApi = null
  }
  return _procApi
}

/** API entry points most often inline-hooked by injected cheats. */
export const HOOK_PRONE_EXPORTS: ReadonlyArray<{ module: string; fn: string }> = [
  { module: 'ntdll.dll', fn: 'NtOpenProcess' },
  { module: 'ntdll.dll', fn: 'NtReadVirtualMemory' },
  { module: 'ntdll.dll', fn: 'NtWriteVirtualMemory' },
  { module: 'ntdll.dll', fn: 'NtProtectVirtualMemory' },
  { module: 'kernel32.dll', fn: 'OpenProcess' },
  { module: 'kernel32.dll', fn: 'ReadProcessMemory' },
  { module: 'kernel32.dll', fn: 'WriteProcessMemory' },
  { module: 'user32.dll', fn: 'GetAsyncKeyState' }
]

export interface ResolvedExport { module: string; fn: string; address: bigint }

/**
 * Resolve the in-our-process addresses of HOOK_PRONE_EXPORTS. Returns [] on
 * non-Windows or when koffi is unavailable. Addresses are resolved in the Custos
 * process; the detector reads the *target* process's bytes at the same address
 * (system DLLs load at the same base across processes within a session).
 */
export function resolveExportAddresses(): ResolvedExport[] {
  if (process.platform !== 'win32') return []
  const api = loadProcApi()
  if (!api) return []
  const out: ResolvedExport[] = []
  for (const { module, fn } of HOOK_PRONE_EXPORTS) {
    try {
      const mod = api.GetModuleHandleA(module)
      if (!mod) continue
      const addr = toPtr(api.GetProcAddress(mod, fn) as number | bigint)
      if (addr !== 0n) out.push({ module, fn, address: addr })
    } catch {
      // skip this export
    }
  }
  return out
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * True when the Windows kernel reports that a debugger is attached to this
 * process (the Custos main process itself). Uses IsDebuggerPresent.
 * Returns false on non-Windows or when koffi is unavailable.
 */
export function isDebuggerPresentSelf(): boolean {
  if (process.platform !== 'win32') return false
  const k32 = loadKernel32()
  if (!k32) return false
  try {
    return (k32.IsDebuggerPresent() as number) !== 0
  } catch {
    return false
  }
}

/**
 * True when CheckRemoteDebuggerPresent reports a debugger attached to this
 * process. Catches a wider class of debuggers than IsDebuggerPresent.
 * Returns false on non-Windows or when koffi is unavailable.
 */
export function checkRemoteDebugger(): boolean {
  if (process.platform !== 'win32') return false
  const k32 = loadKernel32()
  if (!k32) return false
  try {
    const handle = k32.GetCurrentProcess() as number
    // koffi _Out_ int* — pass a 1-element JS array; koffi writes back into it
    const out = [0]
    const ok = k32.CheckRemoteDebuggerPresent(handle, out) as number
    if (!ok) return false
    return (out[0] as number) !== 0
  } catch {
    return false
  }
}

// ── Thread start-address enumeration (detector #6) ───────────────────────────
// Uses CreateToolhelp32Snapshot + Thread32First/Next to list thread IDs for the
// target PID, then OpenThread + NtQueryInformationThread(ThreadQuerySetWin32StartAddress).
// Returns the start addresses as bigints. Returns [] when unavailable.

const TH32CS_SNAPTHREAD = 0x00000004
const THREAD_QUERY_INFORMATION = 0x0040
const ThreadQuerySetWin32StartAddress = 9

interface ThreadApi {
  CreateToolhelp32Snapshot: KoffiFunction
  Thread32First: KoffiFunction
  Thread32Next: KoffiFunction
  OpenThread: KoffiFunction
  CloseHandle: KoffiFunction
  NtQueryInformationThread: KoffiFunction
  THREADENTRY32: unknown
}

let _threadApiLoaded = false
let _threadApi: ThreadApi | null = null

function loadThreadApi(): ThreadApi | null {
  if (_threadApiLoaded) return _threadApi
  _threadApiLoaded = true
  if (process.platform !== 'win32') return null
  const koffi = loadKoffi()
  if (!koffi) return null
  try {
    const k = koffi.load('kernel32.dll')
    const nt = koffi.load('ntdll.dll')
    const THREADENTRY32 = koffi.struct('THREADENTRY32', {
      dwSize: 'uint32', cntUsage: 'uint32', th32ThreadID: 'uint32',
      th32OwnerProcessID: 'uint32', tpBasePri: 'int32', tpDeltaPri: 'int32', dwFlags: 'uint32'
    })
    _threadApi = {
      CreateToolhelp32Snapshot: k.func('void * __stdcall CreateToolhelp32Snapshot(uint32 flags, uint32 pid)'),
      Thread32First: k.func('int __stdcall Thread32First(void *snap, _Inout_ THREADENTRY32 *te)'),
      Thread32Next: k.func('int __stdcall Thread32Next(void *snap, _Inout_ THREADENTRY32 *te)'),
      OpenThread: k.func('void * __stdcall OpenThread(uint32 access, int inherit, uint32 tid)'),
      CloseHandle: k.func('int __stdcall CloseHandle(void *h)'),
      NtQueryInformationThread: nt.func('long __stdcall NtQueryInformationThread(void *h, int cls, _Out_ uint64 *info, uint32 len, _Out_ uint32 *ret)'),
      THREADENTRY32
    }
  } catch {
    _threadApi = null
  }
  return _threadApi
}

export function listThreadStartAddresses(pid: number): bigint[] {
  if (process.platform !== 'win32') return []
  const api = loadThreadApi()
  const koffi = loadKoffi()
  if (!api || !koffi) return []
  const out: bigint[] = []
  let snap: unknown = null
  try {
    snap = api.CreateToolhelp32Snapshot(TH32CS_SNAPTHREAD, 0)
    // INVALID_HANDLE_VALUE is (HANDLE)-1; koffi surfaces it as null or a sentinel.
    if (!snap) return []
    const te = { dwSize: 28, cntUsage: 0, th32ThreadID: 0, th32OwnerProcessID: 0, tpBasePri: 0, tpDeltaPri: 0, dwFlags: 0 }
    let ok = api.Thread32First(snap, te) as number
    while (ok) {
      if (te.th32OwnerProcessID === pid) {
        const h = api.OpenThread(THREAD_QUERY_INFORMATION, 0, te.th32ThreadID)
        if (h) {
          try {
            const addrBuf = [0n] as bigint[]
            const retLen = [0]
            const status = api.NtQueryInformationThread(h, ThreadQuerySetWin32StartAddress, addrBuf, 8, retLen) as number
            if (status === 0) out.push(toPtr(addrBuf[0]))
          } finally {
            api.CloseHandle(h)
          }
        }
      }
      ok = api.Thread32Next(snap, te) as number
    }
  } catch {
    return out
  } finally {
    if (snap) api.CloseHandle(snap)
  }
  return out
}
