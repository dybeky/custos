import { readFile } from 'fs/promises'
import { join } from 'path'
import { BaseScanner, ScannerEventEmitter } from './base-scanner'
import { ScanResult } from '../../shared/types'
import { execFileAsync } from '../utils/async-exec'
import { formatTimestamp } from '../utils/format'
import { lookupBySerial, parsePartitionEvents, parseSetupapiUsb, parseUsbstorRegistry } from './usb-history'

export const USBSTOR_KEY = 'HKLM\\SYSTEM\\CurrentControlSet\\Enum\\USBSTOR'

/** Read setupapi.dev.log (''), tolerant of it being missing or locked. */
export async function readSetupapiLog(): Promise<string> {
  const path = join(process.env.SystemRoot ?? 'C:\\Windows', 'INF', 'setupapi.dev.log')
  try {
    return await readFile(path, 'utf8')
  } catch {
    return ''
  }
}

/**
 * USB storage devices ever attached, with first and last connection times.
 * Context rather than evidence — but "a flash drive plugged in ten minutes
 * before the check" next to "E:\loader.exe ran" in the timeline tells a story.
 */
export class UsbScanner extends BaseScanner {
  readonly name = 'USB History Scanner'
  readonly description = 'USB storage devices ever connected, with first and last connection times'

  protected async doScan(events: ScannerEventEmitter | undefined, startTime: Date): Promise<ScanResult> {
    this.reset()
    this.emitProgress(events, 0, 1, 'Reading USB device history...')
    const [reg, setupapi, partition] = await Promise.all([
      execFileAsync('reg', ['query', USBSTOR_KEY, '/s', '/v', 'FriendlyName'], { timeoutMs: 10000 }),
      readSetupapiLog(),
      execFileAsync(
        'wevtutil',
        ['qe', 'Microsoft-Windows-Partition/Diagnostic', '/q:*[System[(EventID=1006)]]', '/c:2000', '/rd:true', '/f:xml'],
        { timeoutMs: 15000 }
      )
    ])
    if (this.cancelled) return this.createErrorResult('Scan cancelled', startTime)

    const firstSeen = parseSetupapiUsb(setupapi)
    const lastSeen = parsePartitionEvents(partition.stdout)
    const devices = parseUsbstorRegistry(reg.stdout)

    const rows = devices.map((d) => ({ d, last: lookupBySerial(lastSeen, d.serial), first: lookupBySerial(firstSeen, d.serial) }))
    rows.sort((a, b) => (b.last ?? b.first ?? 0) - (a.last ?? a.first ?? 0))

    const findings = rows.map(({ d, last, first }) => {
      let s = `[USB] ${d.name} (serial ${d.serial})`
      // The most recent time comes first so the timeline places the entry there.
      if (last !== undefined) s += ` | last connected ${formatTimestamp(new Date(last))}`
      if (first !== undefined) s += ` | first connected ${formatTimestamp(new Date(first))}`
      return s
    })

    this.emitProgress(events, 1, 1, '')
    return this.createSuccessResult(findings, startTime)
  }
}
