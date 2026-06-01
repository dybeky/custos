/**
 * koffi wrappers for Win32 APIs used by the self-integrity detector.
 *
 * koffi loads on macOS but its Win32 DLL calls obviously only work on Windows.
 * All functions degrade gracefully (return false / null) on non-Windows or when
 * koffi fails to load.
 *
 * TODO: Thread enumeration via CreateToolhelp32Snapshot + Thread32First /
 *       NtQueryInformationThread for the thread-start-address detector (#6).
 *       Deferred to a later phase.
 */

import type { LibraryHandle } from 'koffi'

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
