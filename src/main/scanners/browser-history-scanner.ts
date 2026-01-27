import { existsSync, readFileSync } from 'fs'
import { copyFile, unlink, readdir } from 'fs/promises'
import { join } from 'path'
import { homedir, tmpdir } from 'os'
import { randomUUID } from 'crypto'
import initSqlJs from 'sql.js'
import { BaseScanner, ScannerEventEmitter } from './base-scanner'
import { ScanResult } from '../../shared/types'

interface BrowserProfile {
  browser: string
  profilePath: string
}

interface DatabaseConfig {
  name: string
  file: string
  query: string
  urlColumn: number
  titleColumn?: number
  timeColumn?: number
}

let SQL: Awaited<ReturnType<typeof initSqlJs>> | null = null

async function getSql() {
  if (!SQL) {
    SQL = await initSqlJs()
  }
  return SQL
}

/**
 * Sleep helper for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export class BrowserHistoryScanner extends BaseScanner {
  readonly name = 'Browser History Scanner'
  readonly description = 'Deep search of browser history and caches by keywords'

  // Retry configuration for locked databases
  private static readonly MAX_RETRIES = 3
  private static readonly INITIAL_DELAY_MS = 100

  /**
   * Copy file with exponential backoff retry (for locked browser databases)
   */
  private async copyWithRetry(src: string, dst: string): Promise<void> {
    let lastError: Error | null = null

    for (let attempt = 0; attempt < BrowserHistoryScanner.MAX_RETRIES; attempt++) {
      try {
        await copyFile(src, dst)
        return
      } catch (error) {
        lastError = error as Error
        // Only retry on specific errors (EBUSY, EACCES, EPERM)
        const code = (error as NodeJS.ErrnoException).code
        if (code !== 'EBUSY' && code !== 'EACCES' && code !== 'EPERM') {
          throw error
        }
        // Exponential backoff: 100ms, 200ms, 400ms
        const delay = BrowserHistoryScanner.INITIAL_DELAY_MS * Math.pow(2, attempt)
        await sleep(delay)
      }
    }

    throw lastError || new Error('Failed to copy file after retries')
  }

  /**
   * Safe file deletion with error suppression
   */
  private async safeDelete(path: string): Promise<void> {
    try {
      await unlink(path)
    } catch (error) {
      // Log but don't throw - temp file cleanup failures aren't critical
      const code = (error as NodeJS.ErrnoException).code
      if (code !== 'ENOENT') {
        // File exists but couldn't be deleted - will be cleaned up by OS later
        console.warn(`Failed to delete temp file ${path}: ${code}`)
      }
    }
  }

  // Chromium databases to check (History can be cleared, but these often remain)
  private chromiumDatabases: DatabaseConfig[] = [
    {
      name: 'History',
      file: 'History',
      query: 'SELECT url, title, last_visit_time FROM urls ORDER BY last_visit_time DESC LIMIT 10000',
      urlColumn: 0,
      titleColumn: 1,
      timeColumn: 2
    },
    {
      name: 'Favicons',
      file: 'Favicons',
      query: 'SELECT page_url FROM icon_mapping LIMIT 10000',
      urlColumn: 0
    },
    {
      name: 'Top Sites',
      file: 'Top Sites',
      query: 'SELECT url, title FROM top_sites LIMIT 1000',
      urlColumn: 0,
      titleColumn: 1
    },
    {
      name: 'Shortcuts',
      file: 'Shortcuts',
      query: 'SELECT text, fill_into_edit, url FROM omni_box_shortcuts LIMIT 5000',
      urlColumn: 2,
      titleColumn: 0
    },
    {
      name: 'Network Predictor',
      file: 'Network Action Predictor',
      query: 'SELECT user_text, url FROM network_action_predictor LIMIT 5000',
      urlColumn: 1,
      titleColumn: 0
    },
    {
      name: 'Visited Links',
      file: 'Visited Links',
      query: 'SELECT url FROM visited_links LIMIT 10000',
      urlColumn: 0
    }
  ]

  async scan(events?: ScannerEventEmitter): Promise<ScanResult> {
    const startTime = new Date()
    this.reset()

    try {
      const profiles = await this.findAllBrowserProfiles()
      const results: string[] = []
      const seenUrls = new Set<string>()

      const totalSteps = profiles.length
      let currentStep = 0

      // Process profiles in parallel with concurrency limit of 3
      const concurrency = 3
      const profileChunks: BrowserProfile[][] = []
      for (let i = 0; i < profiles.length; i += concurrency) {
        profileChunks.push(profiles.slice(i, i + concurrency))
      }

      for (const chunk of profileChunks) {
        if (this.cancelled) break

        const chunkPromises = chunk.map(async profile => {
          if (this.cancelled) return []

          currentStep++
          if (events?.onProgress) {
            events.onProgress({
              scannerName: this.name,
              currentItem: currentStep,
              totalItems: totalSteps,
              currentPath: `${profile.browser} - ${profile.profilePath}`,
              percentage: (currentStep / totalSteps) * 100
            })
          }

          const profileResults: string[] = []

          // Scan all Chromium databases for this profile in parallel
          const dbPromises = this.chromiumDatabases.map(async dbConfig => {
            if (this.cancelled) return []

            const dbPath = join(profile.profilePath, dbConfig.file)
            return this.scanDatabase(dbPath, profile.browser, dbConfig, seenUrls)
          })

          const dbResults = await Promise.all(dbPromises)
          for (const findings of dbResults) {
            profileResults.push(...findings)
          }

          return profileResults
        })

        const chunkResults = await Promise.all(chunkPromises)
        for (const profileResults of chunkResults) {
          results.push(...profileResults)
        }
      }

      // Scan Firefox profiles
      const firefoxFindings = await this.scanFirefoxProfiles(seenUrls)
      results.push(...firefoxFindings)

      return this.createSuccessResult(results, startTime)
    } catch (error) {
      if (this.cancelled) {
        return this.createErrorResult('Scan cancelled', startTime)
      }
      return this.createErrorResult(
        error instanceof Error ? error.message : 'Unknown error',
        startTime
      )
    }
  }

  private async findAllBrowserProfiles(): Promise<BrowserProfile[]> {
    const profiles: BrowserProfile[] = []
    const localAppData = process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local')
    const appData = process.env.APPDATA || join(homedir(), 'AppData', 'Roaming')

    const browserPaths = [
      { browser: 'Chrome', basePath: join(localAppData, 'Google', 'Chrome', 'User Data') },
      { browser: 'Edge', basePath: join(localAppData, 'Microsoft', 'Edge', 'User Data') },
      { browser: 'Brave', basePath: join(localAppData, 'BraveSoftware', 'Brave-Browser', 'User Data') },
      { browser: 'Opera', basePath: join(appData, 'Opera Software', 'Opera Stable') },
      { browser: 'Opera GX', basePath: join(appData, 'Opera Software', 'Opera GX Stable') },
      { browser: 'Vivaldi', basePath: join(localAppData, 'Vivaldi', 'User Data') },
      { browser: 'Yandex', basePath: join(localAppData, 'Yandex', 'YandexBrowser', 'User Data') },
      { browser: 'Chrome Canary', basePath: join(localAppData, 'Google', 'Chrome SxS', 'User Data') },
      { browser: 'Chromium', basePath: join(localAppData, 'Chromium', 'User Data') }
    ]

    // Process all browser paths in parallel
    const browserPromises = browserPaths.map(async ({ browser, basePath }) => {
      const browserProfiles: BrowserProfile[] = []

      if (!existsSync(basePath)) return browserProfiles

      // Check Default profile
      const defaultProfile = join(basePath, 'Default')
      if (existsSync(defaultProfile)) {
        browserProfiles.push({ browser, profilePath: defaultProfile })
      }

      // Check numbered profiles (Profile 1, Profile 2, etc.)
      try {
        const entries = await readdir(basePath, { withFileTypes: true })
        for (const entry of entries) {
          if (entry.isDirectory() && entry.name.startsWith('Profile ')) {
            browserProfiles.push({ browser, profilePath: join(basePath, entry.name) })
          }
        }
      } catch (error) {
        // Can't read directory - log for debugging
        console.debug(`Failed to read browser profiles at ${basePath}:`, (error as Error).message)
      }

      // For Opera - it doesn't have User Data structure
      if (browser.startsWith('Opera') && existsSync(join(basePath, 'History'))) {
        browserProfiles.push({ browser, profilePath: basePath })
      }

      return browserProfiles
    })

    const allBrowserProfiles = await Promise.all(browserPromises)
    for (const browserProfiles of allBrowserProfiles) {
      profiles.push(...browserProfiles)
    }

    return profiles
  }

  private async scanDatabase(
    dbPath: string,
    browserName: string,
    config: DatabaseConfig,
    seenUrls: Set<string>
  ): Promise<string[]> {
    const results: string[] = []

    if (!existsSync(dbPath)) {
      return results
    }

    let tempPath: string | null = null

    try {
      // Copy database to temp with retry (browser may have it locked)
      tempPath = join(tmpdir(), `custos_${browserName}_${config.name}_${randomUUID()}.db`)
      await this.copyWithRetry(dbPath, tempPath)

      const SQL = await getSql()
      const fileBuffer = readFileSync(tempPath)
      const db = new SQL.Database(fileBuffer)

      try {
        const rows = db.exec(config.query)

        if (rows.length > 0 && rows[0].values) {
          for (const row of rows[0].values) {
            if (this.cancelled) break

            const url = row[config.urlColumn] as string
            const title = config.titleColumn !== undefined ? row[config.titleColumn] as string : ''

            if (!url) continue

            // Check URL and title for keywords
            const urlMatch = this.keywordMatcher.containsKeyword(url)
            const titleMatch = title && this.keywordMatcher.containsKeyword(title)

            if (urlMatch || titleMatch) {
              // Deduplicate
              const key = `${browserName}:${url}`.toLowerCase()
              if (seenUrls.has(key)) continue
              seenUrls.add(key)

              const keyword = this.keywordMatcher.findKeyword(url) || this.keywordMatcher.findKeyword(title || '')
              const source = config.name

              let entry = `[${browserName}/${source}] `
              if (keyword) entry += `{${keyword}} `
              entry += url
              if (title && title !== url) entry += ` | "${title}"`

              // Add timestamp if available
              if (config.timeColumn !== undefined && row[config.timeColumn]) {
                const time = row[config.timeColumn] as number
                const date = this.convertChromeTimestamp(time)
                if (date.getTime() > 0) {
                  entry += ` | ${this.formatDate(date)}`
                }
              }

              results.push(entry)
            }
          }
        }
      } catch (error) {
        // Query failed (table doesn't exist, etc.) - log for debugging
        console.debug(`Database query failed for ${browserName}/${config.name}:`, (error as Error).message)
      } finally {
        db.close()
      }
    } catch (error) {
      // Database locked or corrupted after retries - log for debugging
      console.debug(`Failed to scan database ${dbPath}:`, (error as Error).message)
    } finally {
      if (tempPath) {
        await this.safeDelete(tempPath)
      }
    }

    return results
  }

  private async scanFirefoxProfiles(seenUrls: Set<string>): Promise<string[]> {
    const results: string[] = []
    const appData = process.env.APPDATA || join(homedir(), 'AppData', 'Roaming')
    const profilesPath = join(appData, 'Mozilla', 'Firefox', 'Profiles')

    if (!existsSync(profilesPath)) {
      return results
    }

    try {
      const profiles = await readdir(profilesPath)

      // Process Firefox profiles in parallel (limit to 3)
      const concurrency = 3
      for (let i = 0; i < profiles.length; i += concurrency) {
        if (this.cancelled) break

        const chunk = profiles.slice(i, i + concurrency)
        const chunkPromises = chunk.map(async profile => {
          if (this.cancelled) return []

          const profilePath = join(profilesPath, profile)
          const profileResults: string[] = []

          // Scan both databases in parallel
          const [placesFindings, formFindings] = await Promise.all([
            this.scanFirefoxPlaces(profilePath, seenUrls),
            this.scanFirefoxFormHistory(profilePath, seenUrls)
          ])

          profileResults.push(...placesFindings)
          profileResults.push(...formFindings)

          return profileResults
        })

        const chunkResults = await Promise.all(chunkPromises)
        for (const profileResults of chunkResults) {
          results.push(...profileResults)
        }
      }
    } catch (error) {
      // Can't read profiles directory - log for debugging
      console.debug(`Failed to read Firefox profiles at ${profilesPath}:`, (error as Error).message)
    }

    return results
  }

  private async scanFirefoxPlaces(profilePath: string, seenUrls: Set<string>): Promise<string[]> {
    const results: string[] = []
    const placesPath = join(profilePath, 'places.sqlite')

    if (!existsSync(placesPath)) {
      return results
    }

    let tempPath: string | null = null

    try {
      tempPath = join(tmpdir(), `custos_firefox_places_${randomUUID()}.db`)
      await this.copyWithRetry(placesPath, tempPath)

      const SQL = await getSql()
      const fileBuffer = readFileSync(tempPath)
      const db = new SQL.Database(fileBuffer)

      try {
        // Query history
        const historyQuery = `
          SELECT p.url, p.title, h.visit_date
          FROM moz_places p
          LEFT JOIN moz_historyvisits h ON p.id = h.place_id
          ORDER BY h.visit_date DESC LIMIT 10000
        `
        const rows = db.exec(historyQuery)

        if (rows.length > 0 && rows[0].values) {
          for (const row of rows[0].values) {
            if (this.cancelled) break

            const url = row[0] as string
            const title = row[1] as string
            const visitDate = row[2] as number

            if (!url) continue

            const urlMatch = this.keywordMatcher.containsKeyword(url)
            const titleMatch = title && this.keywordMatcher.containsKeyword(title)

            if (urlMatch || titleMatch) {
              const key = `Firefox:${url}`.toLowerCase()
              if (seenUrls.has(key)) continue
              seenUrls.add(key)

              const keyword = this.keywordMatcher.findKeyword(url) || this.keywordMatcher.findKeyword(title || '')

              let entry = `[Firefox/History] `
              if (keyword) entry += `{${keyword}} `
              entry += url
              if (title && title !== url) entry += ` | "${title}"`

              if (visitDate) {
                const date = this.convertFirefoxTimestamp(visitDate)
                if (date.getTime() > 0) {
                  entry += ` | ${this.formatDate(date)}`
                }
              }

              results.push(entry)
            }
          }
        }

        // Query bookmarks
        const bookmarksQuery = `
          SELECT p.url, b.title
          FROM moz_bookmarks b
          JOIN moz_places p ON b.fk = p.id
          WHERE p.url IS NOT NULL LIMIT 5000
        `
        const bookmarkRows = db.exec(bookmarksQuery)

        if (bookmarkRows.length > 0 && bookmarkRows[0].values) {
          for (const row of bookmarkRows[0].values) {
            if (this.cancelled) break

            const url = row[0] as string
            const title = row[1] as string

            if (!url) continue

            const urlMatch = this.keywordMatcher.containsKeyword(url)
            const titleMatch = title && this.keywordMatcher.containsKeyword(title)

            if (urlMatch || titleMatch) {
              const key = `Firefox:${url}`.toLowerCase()
              if (seenUrls.has(key)) continue
              seenUrls.add(key)

              const keyword = this.keywordMatcher.findKeyword(url) || this.keywordMatcher.findKeyword(title || '')

              let entry = `[Firefox/Bookmarks] `
              if (keyword) entry += `{${keyword}} `
              entry += url
              if (title) entry += ` | "${title}"`

              results.push(entry)
            }
          }
        }
      } finally {
        db.close()
      }
    } catch (error) {
      // Database locked or corrupted after retries - log for debugging
      console.debug(`Failed to scan Firefox places at ${profilePath}:`, (error as Error).message)
    } finally {
      if (tempPath) {
        await this.safeDelete(tempPath)
      }
    }

    return results
  }

  private async scanFirefoxFormHistory(profilePath: string, seenUrls: Set<string>): Promise<string[]> {
    const results: string[] = []
    const formHistoryPath = join(profilePath, 'formhistory.sqlite')

    if (!existsSync(formHistoryPath)) {
      return results
    }

    let tempPath: string | null = null

    try {
      tempPath = join(tmpdir(), `custos_firefox_form_${randomUUID()}.db`)
      await this.copyWithRetry(formHistoryPath, tempPath)

      const SQL = await getSql()
      const fileBuffer = readFileSync(tempPath)
      const db = new SQL.Database(fileBuffer)

      try {
        // Query form history (search queries, etc.)
        const query = 'SELECT fieldname, value FROM moz_formhistory LIMIT 10000'
        const rows = db.exec(query)

        if (rows.length > 0 && rows[0].values) {
          for (const row of rows[0].values) {
            if (this.cancelled) break

            const fieldName = row[0] as string
            const value = row[1] as string

            if (!value) continue

            if (this.keywordMatcher.containsKeyword(value)) {
              const key = `Firefox:form:${value}`.toLowerCase()
              if (seenUrls.has(key)) continue
              seenUrls.add(key)

              const keyword = this.keywordMatcher.findKeyword(value)

              let entry = `[Firefox/FormHistory] `
              if (keyword) entry += `{${keyword}} `
              entry += `[${fieldName}] "${value}"`

              results.push(entry)
            }
          }
        }
      } finally {
        db.close()
      }
    } catch (error) {
      // Database locked or corrupted after retries - log for debugging
      console.debug(`Failed to scan Firefox form history at ${profilePath}:`, (error as Error).message)
    } finally {
      if (tempPath) {
        await this.safeDelete(tempPath)
      }
    }

    return results
  }

  private convertChromeTimestamp(chromeTimestamp: number): Date {
    try {
      if (chromeTimestamp <= 0) return new Date(0)
      // Chrome timestamp is microseconds since January 1, 1601 UTC
      const unixTimestamp = (chromeTimestamp / 1000) - 11644473600000
      return new Date(unixTimestamp)
    } catch {
      return new Date(0)
    }
  }

  private convertFirefoxTimestamp(firefoxTimestamp: number): Date {
    try {
      if (firefoxTimestamp <= 0) return new Date(0)
      // Firefox timestamp is microseconds since Unix epoch
      return new Date(firefoxTimestamp / 1000)
    } catch {
      return new Date(0)
    }
  }

  private formatDate(date: Date): string {
    if (date.getTime() === 0) return 'Unknown'
    return date.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }
}
