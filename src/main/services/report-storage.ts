import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'fs'
import { join } from 'path'

/** Kept outside both Chromium's session folder and the legacy custos folder. */
export function reportStorageDir(appData: string): string {
  return join(appData, 'Custos Reports')
}

/** Rescue reports before an old session is swept. Never delete the source here.
 * A failure tells the caller to leave that session intact for another attempt.
 */
export function preserveReports(source: string, destination: string): boolean {
  try {
    const oldHistory = join(source, 'history')
    const history = join(destination, 'history')
    if (existsSync(oldHistory)) {
      mkdirSync(history, { recursive: true })
      for (const name of readdirSync(oldHistory)) {
        if (!/^[A-Za-z0-9_-]{1,80}\.json$/.test(name) || name === 'index.json') continue
        const target = join(history, name)
        if (!existsSync(target)) copyFileSync(join(oldHistory, name), target)
      }
      // A missing index is rebuilt by HistoryStore. Leave an existing index
      // invalidated as well so recovered files become visible.
      writeFileSync(join(history, 'index.json'), 'null', 'utf8')
    }
    const oldOutbox = join(source, 'site-outbox.json')
    if (existsSync(oldOutbox)) {
      const target = join(destination, 'site-outbox.json')
      const old = JSON.parse(readFileSync(oldOutbox, 'utf8'))
      const current = existsSync(target) ? JSON.parse(readFileSync(target, 'utf8')) : {}
      if (!old || Array.isArray(old) || typeof old !== 'object' ||
          !current || Array.isArray(current) || typeof current !== 'object') return false
      mkdirSync(destination, { recursive: true })
      writeFileSync(`${target}.tmp`, JSON.stringify({ ...old, ...current }), 'utf8')
      renameSync(`${target}.tmp`, target)
    }
    return true
  } catch {
    return false
  }
}
