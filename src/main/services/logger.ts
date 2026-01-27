import { app } from 'electron'
import { writeFileSync, appendFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { homedir, platform, release, arch, cpus, totalmem, freemem } from 'os'

type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'CRASH' | 'BUG' | 'DEBUG'

interface SystemInfo {
  appVersion: string
  electron: string
  node: string
  chrome: string
  os: string
  osRelease: string
  arch: string
  cpu: string
  cpuCores: number
  totalMemory: string
  freeMemory: string
  userHome: string
  appPath: string
  timestamp: string
}

class Logger {
  private logFilePath: string | null = null
  private hasWrittenHeader = false
  private logBuffer: string[] = []

  constructor() {
    this.setupGlobalHandlers()
  }

  /**
   * Initialize logger with app path
   */
  init(): void {
    try {
      // Get the directory where the app executable is located
      const exePath = app.getPath('exe')
      const appDir = dirname(exePath)

      // Create log file name with date
      const date = new Date().toISOString().split('T')[0]
      this.logFilePath = join(appDir, `custos-log-${date}.txt`)
    } catch {
      // Fallback to user's home directory
      const date = new Date().toISOString().split('T')[0]
      this.logFilePath = join(homedir(), `custos-log-${date}.txt`)
    }
  }

  /**
   * Get system information
   */
  private getSystemInfo(): SystemInfo {
    const cpuInfo = cpus()
    const totalMem = totalmem()
    const freeMem = freemem()

    return {
      appVersion: app.getVersion(),
      electron: process.versions.electron || 'unknown',
      node: process.versions.node || 'unknown',
      chrome: process.versions.chrome || 'unknown',
      os: platform(),
      osRelease: release(),
      arch: arch(),
      cpu: cpuInfo[0]?.model || 'unknown',
      cpuCores: cpuInfo.length,
      totalMemory: `${(totalMem / 1024 / 1024 / 1024).toFixed(2)} GB`,
      freeMemory: `${(freeMem / 1024 / 1024 / 1024).toFixed(2)} GB`,
      userHome: homedir(),
      appPath: app.getPath('exe'),
      timestamp: new Date().toISOString()
    }
  }

  /**
   * Format system info for log file
   */
  private formatSystemInfo(): string {
    const info = this.getSystemInfo()
    return `
================================================================================
                            CUSTOS LOG FILE
================================================================================
Created: ${info.timestamp}

SYSTEM INFORMATION:
--------------------------------------------------------------------------------
  App Version:    ${info.appVersion}
  Electron:       ${info.electron}
  Node.js:        ${info.node}
  Chrome:         ${info.chrome}

  OS:             ${info.os} ${info.osRelease}
  Architecture:   ${info.arch}

  CPU:            ${info.cpu}
  CPU Cores:      ${info.cpuCores}
  Total Memory:   ${info.totalMemory}
  Free Memory:    ${info.freeMemory}

  User Home:      ${info.userHome}
  App Path:       ${info.appPath}
================================================================================

LOG ENTRIES:
--------------------------------------------------------------------------------
`
  }

  /**
   * Format a log entry
   */
  private formatEntry(level: LogLevel, message: string, details?: unknown): string {
    const timestamp = new Date().toISOString()
    const levelPadded = `[${level}]`.padEnd(9)

    let entry = `${timestamp} ${levelPadded} ${message}`

    if (details) {
      if (details instanceof Error) {
        entry += `\n    Error: ${details.message}`
        if (details.stack) {
          entry += `\n    Stack:\n${details.stack.split('\n').map(l => '      ' + l).join('\n')}`
        }
      } else if (typeof details === 'object') {
        try {
          entry += `\n    Details: ${JSON.stringify(details, null, 2).split('\n').map(l => '    ' + l).join('\n')}`
        } catch {
          entry += `\n    Details: [Unable to serialize]`
        }
      } else {
        entry += `\n    Details: ${details}`
      }
    }

    return entry + '\n'
  }

  /**
   * Write to log file (only for critical events)
   */
  private writeToFile(entry: string, forceWrite = false): void {
    if (!this.logFilePath) return

    try {
      // Write header on first write
      if (!this.hasWrittenHeader) {
        writeFileSync(this.logFilePath, this.formatSystemInfo(), 'utf-8')
        this.hasWrittenHeader = true

        // Write any buffered entries
        for (const bufferedEntry of this.logBuffer) {
          appendFileSync(this.logFilePath, bufferedEntry, 'utf-8')
        }
        this.logBuffer = []
      }

      appendFileSync(this.logFilePath, entry, 'utf-8')
    } catch (err) {
      console.error('Failed to write to log file:', err)
    }
  }

  /**
   * Log info message (console only)
   */
  info(message: string, details?: unknown): void {
    const entry = this.formatEntry('INFO', message, details)
    console.log(entry.trim())
  }

  /**
   * Log warning (console + buffer for file)
   */
  warn(message: string, details?: unknown): void {
    const entry = this.formatEntry('WARN', message, details)
    console.warn(entry.trim())
    this.logBuffer.push(entry)

    // Keep buffer limited
    if (this.logBuffer.length > 100) {
      this.logBuffer.shift()
    }
  }

  /**
   * Log error (console + file)
   */
  error(message: string, details?: unknown): void {
    const entry = this.formatEntry('ERROR', message, details)
    console.error(entry.trim())
    this.writeToFile(entry, true)
  }

  /**
   * Log crash (console + file with full context)
   */
  crash(message: string, error?: Error): void {
    const separator = '\n' + '!'.repeat(80) + '\n'
    const entry = separator + this.formatEntry('CRASH', message, error) + separator
    console.error(entry.trim())
    this.writeToFile(entry, true)
  }

  /**
   * Log bug/unexpected behavior (console + file)
   */
  bug(message: string, details?: unknown): void {
    const entry = this.formatEntry('BUG', message, details)
    console.error(entry.trim())
    this.writeToFile(entry, true)
  }

  /**
   * Log debug message (console only in dev)
   */
  debug(message: string, details?: unknown): void {
    if (process.env.NODE_ENV === 'development') {
      const entry = this.formatEntry('DEBUG', message, details)
      console.debug(entry.trim())
    }
  }

  /**
   * Setup global error handlers
   */
  private setupGlobalHandlers(): void {
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      this.crash('Uncaught Exception', error)

      // Give time to write log before exit
      setTimeout(() => {
        process.exit(1)
      }, 1000)
    })

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason) => {
      const error = reason instanceof Error ? reason : new Error(String(reason))
      this.error('Unhandled Promise Rejection', error)
    })

    // Handle warnings
    process.on('warning', (warning) => {
      this.warn(`Node.js Warning: ${warning.name}`, {
        message: warning.message,
        stack: warning.stack
      })
    })
  }

  /**
   * Log app startup
   */
  logStartup(): void {
    this.info(`Custos v${app.getVersion()} starting...`)
    this.debug('System info', this.getSystemInfo())
  }

  /**
   * Log app shutdown
   */
  logShutdown(): void {
    this.info('Custos shutting down')
  }

  /**
   * Get log file path
   */
  getLogPath(): string | null {
    return this.logFilePath
  }

  /**
   * Check if log file exists
   */
  hasLogFile(): boolean {
    return this.logFilePath !== null && existsSync(this.logFilePath)
  }
}

// Export singleton instance
export const logger = new Logger()
