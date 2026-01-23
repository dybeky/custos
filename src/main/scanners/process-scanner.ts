import { execSync } from 'child_process'
import { BaseScanner, ScannerEventEmitter } from './base-scanner'
import { ScanResult } from '../../shared/types'

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

  private async getProcessList(): Promise<ProcessInfo[]> {
    const processes: ProcessInfo[] = []

    try {
      // Use WMIC to get process details including path and command line
      // WMIC is deprecated but still works on Windows 10/11
      const wmicOutput = execSync(
        'wmic process get Name,ProcessId,ExecutablePath,CommandLine /FORMAT:CSV 2>nul',
        {
          encoding: 'utf-8',
          maxBuffer: 50 * 1024 * 1024, // 50MB - command lines can be long
          timeout: 30000
        }
      )

      const lines = wmicOutput.split('\n')

      // Skip header line (first non-empty line)
      let headerPassed = false
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue

        if (!headerPassed) {
          headerPassed = true
          continue
        }

        // CSV format: Node,CommandLine,ExecutablePath,Name,ProcessId
        // The CommandLine can contain commas, so we need to parse carefully
        const parts = this.parseWmicCsvLine(trimmed)

        if (parts.length >= 5) {
          const cmdLine = parts[1] || ''
          const execPath = parts[2] || ''
          const name = parts[3] || ''
          const pid = parseInt(parts[4], 10)

          if (name && !isNaN(pid)) {
            processes.push({
              name,
              pid,
              executablePath: execPath,
              commandLine: cmdLine
            })
          }
        }
      }
    } catch {
      // WMIC failed, try PowerShell as fallback
      try {
        const psOutput = execSync(
          'powershell -NoProfile -Command "Get-Process | Select-Object Name,Id,Path | ConvertTo-Csv -NoTypeInformation"',
          {
            encoding: 'utf-8',
            maxBuffer: 20 * 1024 * 1024,
            timeout: 30000,
            windowsHide: true
          }
        )

        const lines = psOutput.split('\n')
        let headerPassed = false

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue

          if (!headerPassed) {
            headerPassed = true
            continue
          }

          // CSV format: "Name","Id","Path"
          const match = trimmed.match(/"([^"]*)","(\d+)","([^"]*)"/)
          if (match) {
            processes.push({
              name: match[1],
              pid: parseInt(match[2], 10),
              executablePath: match[3] || '',
              commandLine: ''
            })
          }
        }
      } catch {
        // PowerShell also failed, fallback to basic tasklist
        try {
          const output = execSync('tasklist /FO CSV /NH', {
            encoding: 'utf-8',
            maxBuffer: 10 * 1024 * 1024,
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
          // All methods failed
        }
      }
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

    // Don't forget the last part
    parts.push(current.trim())

    return parts
  }
}
