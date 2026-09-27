import { existsSync } from 'fs'
import { readdir, readFile } from 'fs/promises'
import { join } from 'path'
import { BaseScanner, ScannerEventEmitter } from './base-scanner'
import { ScanResult } from '../../shared/types'
import { getAvailableDrives } from '../utils/drive-utils'
import { formatTimestamp } from '../utils/format'
import { parseRecycleInfo } from './recycle-bin'

/**
 * Files the user deleted to the Recycle Bin whose ORIGINAL name or path
 * matches a known cheat — with the exact deletion time, and whether the file
 * can still be restored. Deleting a loader right before a check is common.
 */
export class RecycleBinScanner extends BaseScanner {
  readonly name = 'Recycle Bin Scanner'
  readonly description = 'Deleted files in the Recycle Bin matched against cheat names'

  protected async doScan(events: ScannerEventEmitter | undefined, startTime: Date): Promise<ScanResult> {
    this.reset()
    const findings: string[] = []
    const drives = await getAvailableDrives().catch(() => ['C:'])

    for (let d = 0; d < drives.length; d++) {
      if (this.cancelled) break
      const bin = join(`${drives[d]}\\`, '$Recycle.Bin')
      this.emitProgress(events, d, drives.length, bin)
      if (!existsSync(bin)) continue

      let sids: string[]
      try {
        sids = await readdir(bin)
      } catch {
        continue // needs admin for other users' bins
      }
      for (const sid of sids) {
        if (this.cancelled) break
        const dir = join(bin, sid)
        let names: string[]
        try {
          names = await readdir(dir)
        } catch {
          continue
        }
        const present = new Set(names.map((n) => n.toUpperCase()))
        for (const name of names) {
          if (!/^\$I/i.test(name)) continue
          let entry
          try {
            entry = parseRecycleInfo(await readFile(join(dir, name)))
          } catch {
            continue
          }
          if (!entry || !this.keywordMatcher.containsKeyword(entry.originalPath)) continue
          const restorable = present.has(`$R${name.slice(2)}`.toUpperCase())
          findings.push(
            `[Recycle Bin] ${entry.originalPath} | deleted ${formatTimestamp(new Date(entry.deletedAt))}` +
              (restorable ? ' | still restorable' : '')
          )
        }
      }
    }

    this.emitProgress(events, drives.length, drives.length, '')
    return this.createSuccessResult(findings, startTime)
  }
}
