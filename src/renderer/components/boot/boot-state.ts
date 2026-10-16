import { create } from 'zustand'
import type { BootStepId } from './boot-sequence'

interface BootState {
  done: ReadonlySet<BootStepId>
  mark: (id: BootStepId) => void
}

/** Which real startup steps have finished; the splash reads it every frame without subscribing. */
export const useBootStore = create<BootState>((set) => ({
  done: new Set(),
  mark: (id) => set((s) => (s.done.has(id) ? s : { done: new Set([...s.done, id]) }))
}))

/** Marks `id` done when `work` settles, whether it worked or not: a failed step must not hang the intro. */
export function trackBootStep(id: BootStepId, work: () => Promise<unknown> | undefined): void {
  let started: Promise<unknown>
  try {
    started = Promise.resolve(work())
  } catch {
    started = Promise.resolve()
  }
  void started.catch(() => {}).finally(() => useBootStore.getState().mark(id))
}

/** Cheap local calls that warm what the first screens need, tracked as the last intro steps. */
export function startBootProbes(): void {
  const api = window.electronAPI
  trackBootStep('scanners', () => api?.getScanners?.())
  trackBootStep('system', () => api?.getOsInfo?.())
}
