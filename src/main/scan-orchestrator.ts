import { IPC_CHANNELS, ScanProgress, ScanResult } from '../shared/types'
import { logger } from './services/logger'
import { ScannerName, ScannerFactory, BaseScanner } from './scanners'
import { ThrottledProgress } from './utils/progress-throttle'

export interface ScannerGroup {
  id: 'A' | 'B' | 'C' | 'D'
  concurrency: number
  members: ScannerName[]
}

export const SCANNER_GROUPS: ScannerGroup[] = [
  { id: 'A', concurrency: 5, members: ['appdata', 'prefetch', 'recentfiles', 'gamefolder', 'steam'] },
  { id: 'B', concurrency: 4, members: ['registry', 'bam', 'shellbags', 'amcache', 'scheduledtasks'] },
  { id: 'C', concurrency: 2, members: ['process', 'browserhistory', 'dnscache'] },
  { id: 'D', concurrency: 1, members: ['vm'] },
]

export function getGroupForScanner(id: ScannerName): ScannerGroup | undefined {
  return SCANNER_GROUPS.find(g => g.members.includes(id))
}

export interface RunScanOptions {
  factory: ScannerFactory
  requestedIds: ScannerName[]
  supportedIds: Set<ScannerName>
  emit: (channel: string, payload: unknown) => void
  signal: AbortSignal
  timeoutMs: number
}

async function runScannerWithTimeout(
  scanner: BaseScanner,
  timeoutMs: number,
  events: { onProgress: (progress: ScanProgress) => void }
): Promise<ScanResult> {
  const startTime = Date.now()
  logger.debug(`Scanner starting: ${scanner.name}`)

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      logger.warn(`Scanner timeout: ${scanner.name}`, { timeoutMs })
      scanner.cancel()
      resolve({
        scannerName: scanner.name,
        success: false,
        findings: [],
        error: `Scanner timeout (${timeoutMs / 1000}s)`,
        startTime: new Date(),
        endTime: new Date(),
        duration: timeoutMs,
        count: 0,
        hasFindings: false
      })
    }, timeoutMs)

    scanner.scan(events)
      .then(result => {
        clearTimeout(timeout)
        logger.debug(`Scanner completed: ${scanner.name}`, {
          duration: `${Date.now() - startTime}ms`,
          findings: result.findings.length
        })
        resolve(result)
      })
      .catch((err) => {
        clearTimeout(timeout)
        logger.error(`Scanner error: ${scanner.name}`, err)
        resolve({
          scannerName: scanner.name,
          success: false,
          findings: [],
          error: err instanceof Error ? err.message : String(err),
          startTime: new Date(),
          endTime: new Date(),
          duration: 0,
          count: 0,
          hasFindings: false
        })
      })
  })
}

async function runScannerGroup(
  scanners: BaseScanner[],
  concurrency: number,
  timeoutMs: number,
  throttledProgress: ThrottledProgress,
  completedRef: { count: number },
  totalScanners: number,
  emit: (channel: string, payload: unknown) => void,
  signal: AbortSignal
): Promise<ScanResult[]> {
  const results: ScanResult[] = []
  const executing = new Set<Promise<void>>()

  for (const scanner of scanners) {
    if (signal.aborted) break

    const scanPromise = (async () => {
      // Capture index before await to avoid race condition with concurrent scanners
      const localIndex = ++completedRef.count

      // Send progress update for starting scanner
      emit(IPC_CHANNELS.SCAN_PROGRESS, {
        scannerName: scanner.name,
        currentItem: localIndex,
        totalItems: totalScanners,
        currentPath: `Starting ${scanner.name}...`,
        percentage: ((localIndex - 1) / totalScanners) * 100
      } as ScanProgress)

      const result = await runScannerWithTimeout(scanner, timeoutMs, {
        onProgress: (progress: ScanProgress) => {
          throttledProgress.emit(progress, (p) => emit(IPC_CHANNELS.SCAN_PROGRESS, p))
        }
      })

      results.push(result)

      // Send individual result
      emit(IPC_CHANNELS.SCAN_RESULT, result)
    })()

    // Self-removing: promise removes itself from the set when it settles
    const tracked = scanPromise.then(
      () => { executing.delete(tracked) },
      () => { executing.delete(tracked) }
    )
    executing.add(tracked)

    // Limit concurrency — wait for any promise to settle before adding more
    if (executing.size >= concurrency) {
      await Promise.race(executing)
    }
  }

  await Promise.all(executing)
  return results
}

export async function runScan(opts: RunScanOptions): Promise<ScanResult[]> {
  const { factory, requestedIds, supportedIds, emit, signal, timeoutMs } = opts

  const allScanners = requestedIds
    .filter(id => supportedIds.has(id))
    .map(id => factory.getScanner(id))
    .filter((s): s is NonNullable<typeof s> => s !== undefined)

  const throttledProgress = new ThrottledProgress(100)
  const completedRef = { count: 0 }
  const totalScanners = allScanners.length

  // Build per-group scanner lists keyed off stable ScannerName ids
  const groupScanners = new Map<ScannerName, BaseScanner>(
    requestedIds
      .filter(id => supportedIds.has(id))
      .flatMap(id => {
        const s = factory.getScanner(id)
        return s ? [[id, s]] : []
      })
  )

  const groupedArrays = SCANNER_GROUPS.map(group => ({
    group,
    scanners: group.members
      .filter(id => groupScanners.has(id))
      .map(id => groupScanners.get(id)!)
  }))

  const results = (await Promise.all(
    groupedArrays.map(({ group, scanners }) =>
      runScannerGroup(
        scanners,
        group.concurrency,
        timeoutMs,
        throttledProgress,
        completedRef,
        totalScanners,
        emit,
        signal
      )
    )
  )).flat()

  return results
}
