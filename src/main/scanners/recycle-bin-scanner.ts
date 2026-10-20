import { existsSync } from 'fs'
import { readdir } from 'fs/promises'
import { readCapped } from '../utils/read-capped'
import { join } from 'path'
import { BaseScanner, ScannerEventEmitter } from './base-scanner'
import { ScanResult } from '../../shared/types'
import { getAvailableDrives } from '../utils/drive-utils'
import { formatTimestamp } from '../utils/format'
import { parseRecycleInfo } from './recycle-bin'
import { mapWithConcurrency } from '../utils/concurrency'

/** `$I` files read at once. */
const INFO_PARALLEL = 16

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
    let timedOut = false

    for (let d = 0; d < drives.length; d++) {
      if (this.cancelled) break
      if (this.outOfTime()) { timedOut = true; break }
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
        if (this.outOfTime()) { timedOut = true; break }
        const dir = join(bin, sid)
        let names: string[]
        try {
          names = await readdir(dir)
        } catch {
          continue
        }
        const present = new Set(names.map((n) => n.toUpperCase()))
        // A bin can hold thousands of small $I files and every open is slowed by an antivirus: read them
        // several at a time instead of one after the other.
        const infoNames = names.filter((n) => /^\$I/i.test(n))
        const entries = await mapWithConcurrency(infoNames, INFO_PARALLEL, async (n) => {
          if (this.cancelled || this.outOfTime()) return undefined
          try {
            return parseRecycleInfo(await readCapped(join(dir, n), 1024 * 1024))
          } catch {
            return undefined
          }
        })
        for (let i = 0; i < infoNames.length; i++) {
          if (this.outOfTime()) { timedOut = true; break }
          const name = infoNames[i]
          const entry = entries[i]
          if (!entry) continue
          const rName = `$R${name.slice(2)}`
          const restorable = present.has(rName.toUpperCase())
          const deleted = ` | deleted ${formatTimestamp(new Date(entry.deletedAt))}`
          if (this.keywordMatcher.containsKeyword(entry.originalPath)) {
            findings.push(`[Recycle Bin] ${entry.originalPath}${deleted}` + (restorable ? ' | still restorable' : ''))
            continue
          }
          // A deleted folder with a plain name can still hold a cheat: its
          // contents sit, restorable, inside $R<id>.
          if (!restorable) continue
          const rPath = join(dir, names.find((n) => n.toUpperCase() === rName.toUpperCase()) ?? rName)
          for (const inner of await this.scanFolder(rPath, [], 4)) {
            const rel = inner.slice(rPath.length).replace(/^[\\/]+/, '')
            findings.push(`[Recycle Bin] ${entry.originalPath}\\${rel}${deleted} | still restorable`)
          }
        }
      }
    }

    this.emitProgress(events, drives.length, drives.length, '')
    return this.createSuccessResult(findings, startTime, timedOut ? 'The Recycle Bin was only partly read (time limit reached)' : undefined)
  }
}
