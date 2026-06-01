import { ScanProgress } from '../../shared/types'

export class ThrottledProgress {
  private lastEmit = 0
  private minInterval: number

  constructor(minInterval = 100) {
    this.minInterval = minInterval
  }

  emit(progress: ScanProgress, emitter: (p: ScanProgress) => void): void {
    const now = Date.now()
    // Always emit at 0%, 100%, or if enough time has passed
    if (
      progress.percentage === 0 ||
      progress.percentage >= 100 ||
      now - this.lastEmit >= this.minInterval
    ) {
      emitter(progress)
      this.lastEmit = now
    }
  }

  reset(): void {
    this.lastEmit = 0
  }
}
