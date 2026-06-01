import { createHash } from 'crypto'
import { createReadStream, existsSync, readdirSync, statSync } from 'fs'
import { basename, join } from 'path'
import { homedir, tmpdir } from 'os'
import { BaseScanner, ScannerEventEmitter } from './base-scanner'
import { ScanResult } from '../../shared/types'
import { KeywordMatcher } from '../services/keyword-matcher'
import { ScanSettings, configService } from '../services/config-service'

/** Maximum file size to hash (100 MB). Files larger than this are skipped. */
const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024

/** Maximum walk depth below each target directory. */
const MAX_DEPTH = 2

/** Maximum total files to process across all directories. */
const MAX_FILES = 5000

/** Compute the SHA-256 hex digest of a file by streaming its contents. */
export async function hashFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(filePath)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
    stream.on('error', (err) => reject(err))
  })
}

export class FileHashScanner extends BaseScanner {
  readonly name = 'File Hash Scanner'
  readonly description = 'SHA-256 hashing of Downloads/Desktop/Temp against known cheat hashes'

  private knownHashSet: Set<string>

  constructor(keywordMatcher: KeywordMatcher, scanSettings: ScanSettings) {
    super(keywordMatcher, scanSettings)
    const hashes = configService.loadKnownHashes()
    this.knownHashSet = new Set(hashes)
  }

  protected async doScan(events: ScannerEventEmitter | undefined, startTime: Date): Promise<ScanResult> {
    this.reset()

    const home = homedir()
    const targetDirs = [
      join(home, 'Downloads'),
      join(home, 'Desktop'),
      tmpdir()
    ].filter(d => existsSync(d))

    // Collect all candidate file paths up to the cap, then hash them.
    const filePaths: string[] = []
    this.collectFiles(targetDirs, filePaths)

    const findings: string[] = []
    const total = filePaths.length

    for (let i = 0; i < filePaths.length; i++) {
      if (this.cancelled) break

      const filePath = filePaths[i]

      if (i % 50 === 0) {
        this.emitProgress(events, i, total, filePath)
      }

      try {
        const stats = statSync(filePath)
        if (stats.size > MAX_FILE_SIZE_BYTES) continue

        const hash = await hashFile(filePath)
        const name = basename(filePath)
        const isKnownHash = this.knownHashSet.has(hash)
        const isKeywordMatch = this.keywordMatcher.containsKeyword(name)

        if (isKnownHash || isKeywordMatch) {
          const reason = isKnownHash ? 'known-hash' : 'keyword'
          findings.push(`${filePath} [sha256:${hash.slice(0, 16)}…] (${reason})`)
        }
      } catch {
        // Skip files that are locked, unreadable, or disappeared
      }
    }

    this.emitProgress(events, total, total, '')
    return this.createSuccessResult(findings, startTime)
  }

  /**
   * Walk all target directories up to MAX_DEPTH and collect regular file paths
   * into `out`, stopping once MAX_FILES is reached or `this.cancelled` is set.
   */
  private collectFiles(dirs: string[], out: string[]): void {
    for (const dir of dirs) {
      if (this.cancelled || out.length >= MAX_FILES) break
      this.walkDir(dir, 0, out)
    }
  }

  private walkDir(dir: string, depth: number, out: string[]): void {
    if (depth > MAX_DEPTH) return
    if (this.cancelled || out.length >= MAX_FILES) return

    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      if (this.cancelled || out.length >= MAX_FILES) break
      if (entry.isSymbolicLink()) continue

      const fullPath = join(dir, entry.name)

      if (entry.isDirectory()) {
        if (this.excludedDirs.has(entry.name.toLowerCase())) continue
        this.walkDir(fullPath, depth + 1, out)
      } else if (entry.isFile()) {
        out.push(fullPath)
      }
    }
  }
}
