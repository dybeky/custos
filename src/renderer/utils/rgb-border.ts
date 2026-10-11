const KEY = 'custos-rgb-border'
const EVENT = 'custos-rgb-border'

/** Whether the RGB window border is on (per-PC preference, on by default). */
export function isRgbBorderEnabled(): boolean {
  try {
    return globalThis.localStorage?.getItem(KEY) !== 'off'
  } catch {
    return true
  }
}

export function setRgbBorderEnabled(on: boolean): void {
  try {
    globalThis.localStorage?.setItem(KEY, on ? 'on' : 'off')
  } catch {
    // storage unavailable — the choice lasts for this session only
  }
  window.dispatchEvent(new Event(EVENT))
}

/** For useSyncExternalStore: re-render when the preference changes. */
export function subscribeRgbBorder(onChange: () => void): () => void {
  window.addEventListener(EVENT, onChange)
  return () => window.removeEventListener(EVENT, onChange)
}
