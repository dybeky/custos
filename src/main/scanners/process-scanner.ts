import { BaseScanner, ScannerEventEmitter } from './base-scanner'
import { ScanResult } from '../../shared/types'
import { asyncExec } from '../utils/async-exec'

interface ProcessInfo {
  name: string
  pid: number
  executablePath: string
  commandLine: string
}

export class ProcessScanner extends BaseScanner {
  readonly name = 'Process Scanner'
  readonly description = 'Scanning running processes with paths and command lines'

  async scan(events?: ScannerEventEmitter): Promise<ScanResult> {
    const startTime = new Date()
    this.reset()

    try {
      const processes = await this.getProcessList()
      const results: string[] = []
      const seenPids = new Set<number>()

      for (let i = 0; i < processes.length; i++) {
        if (this.cancelled) break

        const proc = processes[i]

        // Skip duplicates
        if (seenPids.has(proc.pid)) continue
        seenPids.add(proc.pid)

        if (events?.onProgress) {
          events.onProgress({
            scannerName: this.name,
            currentItem: i + 1,
            totalItems: processes.length,
            currentPath: proc.name,
            percentage: ((i + 1) / processes.length) * 100
          })
        }

        // Check process name, executable path, and command line for keywords
        const nameMatch = this.keywordMatcher.containsKeyword(proc.name)
        const pathMatch = proc.executablePath && this.keywordMatcher.containsKeyword(proc.executablePath)
        const cmdMatch = proc.commandLine && this.keywordMatcher.containsKeyword(proc.commandLine)

        if (nameMatch || pathMatch || cmdMatch) {
          let entry = `[Process] ${proc.name} (PID: ${proc.pid})`

          if (proc.executablePath && proc.executablePath !== proc.name) {
            entry += `\n    Path: ${proc.executablePath}`
          }

          if (proc.commandLine && proc.commandLine !== proc.executablePath) {
            // Truncate very long command lines
            const cmdLine = proc.commandLine.length > 500
              ? proc.commandLine.substring(0, 500) + '...'
              : proc.commandLine
            entry += `\n    CMD: ${cmdLine}`
          }

          results.push(entry)
        }
      }

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

  // Standardized buffer size for all process queries
  private static readonly BUFFER_SIZE = 30 * 1024 * 1024 // 30MB

  private async getProcessList(): Promise<ProcessInfo[]> {
    // Try WMIC first (fast and reliable, doesn't hang like PowerShell)
    const wmicProcesses = await this.getProcessListWmic()
    if (wmicProcesses.length > 0) {
      return wmicProcesses
    }

    // Fallback to tasklist (basic but fast)
    const tasklistProcesses = await this.getProcessListTasklist()
    if (tasklistProcesses.length > 0) {
      return tasklistProcesses
    }

    // Last resort: PowerShell (can hang on some systems)
    return this.getProcessListPowerShell()
  }

  private async getProcessListPowerShell(): Promise<ProcessInfo[]> {
    const processes: ProcessInfo[] = []

    try {
      // Use PowerShell with JSON output for reliable parsing
      const psScript = `
Get-CimInstance Win32_Process | Select-Object Name, ProcessId, ExecutablePath, CommandLine | ConvertTo-Json -Compress
`
      const encoded = Buffer.from(psScript, 'utf16le').toString('base64')
      const output = await asyncExec(
        `powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encoded}`,
        {
          maxBuffer: ProcessScanner.BUFFER_SIZE,
          timeout: 10000 // Short timeout - PowerShell can hang
        }
      )

      const trimmed = output.trim()
      if (!trimmed) return processes

      // Parse JSON output
      const data = JSON.parse(trimmed)
      const items = Array.isArray(data) ? data : [data]

      for (const item of items) {
        if (item.Name && item.ProcessId != null) {
          processes.push({
            name: item.Name || '',
            pid: parseInt(item.ProcessId, 10),
            executablePath: item.ExecutablePath || '',
            commandLine: item.CommandLine || ''
          })
        }
      }
    } catch {
      // PowerShell JSON method failed
    }

    return processes
  }

  private async getProcessListWmic(): Promise<ProcessInfo[]> {
    const processes: ProcessInfo[] = []

    try {
      // WMIC is deprecated but still works
      const output = await asyncExec(
        'wmic process get Name,ProcessId,ExecutablePath,CommandLine /FORMAT:CSV 2>nul',
        {
          maxBuffer: ProcessScanner.BUFFER_SIZE,
          timeout: 30000
        }
      )

      const lines = output.split('\n')
      let headerPassed = false

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue

        if (!headerPassed) {
          headerPassed = true
          continue
        }

        const parts = this.parseWmicCsvLine(trimmed)
        if (parts.length >= 5) {
          const name = parts[3] || ''
          const pid = parseInt(parts[4], 10)
          if (name && !isNaN(pid)) {
            processes.push({
              name,
              pid,
              executablePath: parts[2] || '',
              commandLine: parts[1] || ''
            })
          }
        }
      }
    } catch {
      // WMIC failed
    }

    return processes
  }

  private async getProcessListTasklist(): Promise<ProcessInfo[]> {
    const processes: ProcessInfo[] = []

    try {
      const output = await asyncExec('tasklist /FO CSV /NH', {
        maxBuffer: ProcessScanner.BUFFER_SIZE,
        timeout: 10000
      })

      const lines = output.split('\n')
      for (const line of lines) {
        if (!line.trim()) continue

        const match = line.match(/"([^"]+)","(\d+)"/)
        if (match) {
          processes.push({
            name: match[1],
            pid: parseInt(match[2], 10),
            executablePath: '',
            commandLine: ''
          })
        }
      }
    } catch {
      // Tasklist failed
    }

    return processes
  }

  private parseWmicCsvLine(line: string): string[] {
    const parts: string[] = []
    let current = ''
    let inQuotes = false

    for (let i = 0; i < line.length; i++) {
      const char = line[i]

      if (char === '"') {
        inQuotes = !inQuotes
      } else if (char === ',' && !inQuotes) {
        parts.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }

    parts.push(current.trim())
    return parts
  }
}
