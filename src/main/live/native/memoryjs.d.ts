/**
 * Ambient types for `memoryjs` — covers only the subset used by the live
 * memory detectors. memoryjs is a Windows-only prebuilt native addon; this
 * declaration lets TypeScript type-check the wrapper without importing the
 * module directly at the module level.
 *
 * Page-protection and memory-type constants match the Win32 definitions:
 *   https://learn.microsoft.com/en-us/windows/win32/memory/memory-protection-constants
 */
declare module 'memoryjs' {
  // ── Page-protection constants ────────────────────────────────────────────

  /** Execute-only */
  const PAGE_EXECUTE: number
  /** Execute + read */
  const PAGE_EXECUTE_READ: number
  /** Execute + read/write */
  const PAGE_EXECUTE_READWRITE: number
  /** Execute + copy-on-write */
  const PAGE_EXECUTE_WRITECOPY: number

  /** Read-only */
  const PAGE_READONLY: number
  /** Read/write */
  const PAGE_READWRITE: number

  /** No-access */
  const PAGE_NOACCESS: number

  // ── Memory-type constants ────────────────────────────────────────────────

  /** Private (not backed by a file or section) */
  const MEM_PRIVATE: number
  /** Mapped */
  const MEM_MAPPED: number
  /** Image (backed by a PE image section) */
  const MEM_IMAGE: number

  // ── Data shapes ──────────────────────────────────────────────────────────

  interface Process {
    /** Win32 process ID */
    th32ProcessID: number
    /** Executable name (e.g. "Unturned.exe") */
    szExeFile: string
    /** Handle — only meaningful if you called openProcess() */
    handle: number
  }

  interface Module {
    /** Module base address */
    modBaseAddr: number
    /** Module size in bytes */
    modBaseSize: number
    /** Fully-qualified path on disk */
    szExePath: string
    /** Module name (filename without path) */
    szModule: string
  }

  interface Region {
    /** Base address of this region */
    BaseAddress: number
    /** Allocation base (may differ from BaseAddress within a large allocation) */
    AllocationBase: number
    /** Protection flags at allocation time */
    AllocationProtect: number
    /** Size of the region in bytes */
    RegionSize: number
    /** MEM_COMMIT / MEM_RESERVE / MEM_FREE */
    State: number
    /** Current effective protection flags (PAGE_EXECUTE_READ etc.) */
    Protect: number
    /** MEM_PRIVATE | MEM_MAPPED | MEM_IMAGE */
    Type: number
  }

  interface PatternResult {
    /** Address where the pattern was found; 0 if not found */
    address: number
    /** True when the scan succeeded (even if no match was found) */
    complete: boolean
  }

  // ── API ───────────────────────────────────────────────────────────────────

  /**
   * Open a process by PID or name.
   * @param identifier  Process ID (number) or executable name (string).
   * @returns A Process object whose `.handle` field is the OS process handle.
   */
  function openProcess(identifier: number | string): Process

  /**
   * Return a snapshot of all currently running processes.
   */
  function getProcesses(): Process[]

  /**
   * List all modules loaded in a process.
   * @param pid The process ID (not the handle).
   */
  function getModules(pid: number): Module[]

  /**
   * Enumerate virtual-memory regions in a process.
   * Wraps VirtualQueryEx.
   * @param handle The OS process handle from openProcess().
   */
  function getRegions(handle: number): Region[]

  /**
   * Read memory from a process.
   * @param handle  The OS process handle.
   * @param address Target address.
   * @param type    A memoryjs type string, e.g. 'uint8', 'uint32', 'buffer'.
   */
  function readMemory(handle: number, address: number, type: string): unknown

  /**
   * AOB / byte-pattern scan within a module's memory range.
   * @param handle  The OS process handle.
   * @param module  Module name (e.g. "UnityPlayer.dll") or "" for all memory.
   * @param pattern Space-separated hex bytes with ?? wildcards (e.g. "48 8B ?? 00").
   * @param flags   Scan flags (0 for default).
   * @param offset  Byte offset added to the found address.
   */
  function findPattern(
    handle: number,
    module: string,
    pattern: string,
    flags: number,
    offset: number
  ): PatternResult

  /**
   * Close a process handle previously obtained from openProcess().
   */
  function closeHandle(handle: number): void
}
