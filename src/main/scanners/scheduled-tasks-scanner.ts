import { BaseScanner, ScannerEventEmitter } from './base-scanner'
import { ScanResult } from '../../shared/types'
import { asyncExec } from '../utils/async-exec'
import { logger } from '../services/logger'

interface ScheduledTask {
  taskName: string
  taskToRun: string
  status: string
}

/** Prefixes for system tasks that should be filtered out to reduce noise */
const SYSTEM_TASK_PREFIXES = [
  '\\microsoft\\',
  '\\windows\\',
  '\\apple\\',
  '\\google\\update',
  '\\mozilla\\',
  '\\nvidia\\',
  '\\intel\\',
  '\\amd\\',
  '\\adobe\\',
]

export class ScheduledTasksScanner extends BaseScanner {
  readonly name = 'Scheduled Tasks Scanner'
  readonly description = 'Scanning Windows Task Scheduler for suspicious persistence entries'

  async scan(events?: ScannerEventEmitter): Promise<ScanResult> {
    const startTime = new Date()
    this.reset()

    try {
      const results: string[] = []

      if (events?.onProgress) {
        events.onProgress({
          scannerName: this.name,
          currentItem: 1,
          totalItems: 3,
          currentPath: 'Querying scheduled tasks...',
          percentage: 10
        })
      }

      // /fo CSV = CSV format, /v = verbose (includes command), /nh = no header
      const output = await asyncExec(
        'schtasks /query /fo CSV /v /nh',
        {
          timeout: 20000,
          maxBuffer: 20 * 1024 * 1024
        }
      )

      if (this.cancelled) {
        return this.createErrorResult('Scan cancelled', startTime)
      }

      if (events?.onProgress) {
        events.onProgress({
          scannerName: this.name,
          currentItem: 2,
          totalItems: 3,
          currentPath: 'Parsing task entries...',
          percentage: 40
        })
      }

      const tasks = this.parseCsvOutput(output)

      if (events?.onProgress) {
        events.onProgress({
          scannerName: this.name,
          currentItem: 3,
          totalItems: 3,
          currentPath: `Checking ${tasks.length} tasks against keywords...`,
          percentage: 70
        })
      }

      const seenTasks = new Set<string>()
      for (const task of tasks) {
        if (this.cancelled) break

        // Skip known system tasks
        if (this.isSystemTask(task.taskName)) continue

        // Dedup by task name
        const key = task.taskName.toLowerCase()
        if (seenTasks.has(key)) continue
        seenTasks.add(key)

        // Check task name and command for keywords
        const nameMatch = this.keywordMatcher.containsKeyword(task.taskName)
        const cmdMatch = task.taskToRun && this.keywordMatcher.containsKeyword(task.taskToRun)

        if (nameMatch || cmdMatch) {
          const keyword = this.keywordMatcher.findKeyword(task.taskName) ||
            this.keywordMatcher.findKeyword(task.taskToRun)

          let entry = `[Scheduled Task] `
          if (keyword) entry += `{${keyword}} `
          entry += task.taskName
          if (task.taskToRun) entry += ` | CMD: ${task.taskToRun}`
          if (task.status) entry += ` | Status: ${task.status}`

          results.push(entry)
        }
      }

      return this.createSuccessResult(results, startTime)
    } catch (error) {
      if (this.cancelled) {
        return this.createErrorResult('Scan cancelled', startTime)
      }
      logger.error('Scheduled Tasks Scanner error', error instanceof Error ? error : new Error(String(error)))
      return this.createErrorResult(
        error instanceof Error ? error.message : 'Unknown error',
        startTime
      )
    }
  }

  /**
   * Parse CSV output from schtasks /query /fo CSV /v /nh
   * CSV columns (English): HostName, TaskName, Next Run Time, Status, Logon Mode,
   *   Last Run Time, Last Result, Author, Task To Run, Start In, Comment, ...
   * Column indices: 0=Host, 1=TaskName, 3=Status, 8=TaskToRun
   */
  private parseCsvOutput(output: string): ScheduledTask[] {
    const tasks: ScheduledTask[] = []
    const lines = output.split('\n')

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue

      const fields = this.parseCsvLine(trimmed)
      // Verbose CSV has many columns; we need at least 9 for TaskToRun
      if (fields.length < 9) continue

      const taskName = fields[1]
      const status = fields[3]
      const taskToRun = fields[8]

      // Skip empty rows and header remnants
      if (!taskName || taskName === 'TaskName') continue

      tasks.push({ taskName, taskToRun: taskToRun || '', status: status || '' })
    }

    return tasks
  }

  /** Parse a single CSV line handling quoted fields */
  private parseCsvLine(line: string): string[] {
    const fields: string[] = []
    let current = ''
    let inQuotes = false

    for (let i = 0; i < line.length; i++) {
      const char = line[i]

      if (char === '"') {
        if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
          // Escaped quote ""
          current += '"'
          i++
        } else {
          inQuotes = !inQuotes
        }
      } else if (char === ',' && !inQuotes) {
        fields.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }

    fields.push(current.trim())
    return fields
  }

  private isSystemTask(taskName: string): boolean {
    const nameLower = taskName.toLowerCase()
    return SYSTEM_TASK_PREFIXES.some(prefix => nameLower.includes(prefix))
  }
}
