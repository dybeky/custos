import { resolve } from 'path'
import { fileURLToPath } from 'url'

export interface RendererUrlRules {
  /** Dev server address (ELECTRON_RENDERER_URL) when running `electron-vite dev`. */
  devUrl?: string
  /** Absolute path of the bundled renderer's index.html. */
  rendererIndex: string
  platform?: NodeJS.Platform
}

/**
 * True for the dev server origin (dev only) or the bundled index.html — the
 * only pages that may hold the privileged electronAPI bridge. Pure, so the
 * navigation guard and the IPC sender check share (and test) one rule.
 */
export function isTrustedRendererUrl(url: string, rules: RendererUrlRules): boolean {
  if (typeof url !== 'string' || url === '') return false
  const platform = rules.platform ?? process.platform
  if (rules.devUrl) {
    try {
      return new URL(url).origin === new URL(rules.devUrl).origin
    } catch {
      return false
    }
  }
  try {
    const target = new URL(url)
    if (target.protocol !== 'file:') return false
    const norm = (p: string): string => (platform === 'win32' ? resolve(p).toLowerCase() : resolve(p))
    return norm(fileURLToPath(target)) === norm(rules.rendererIndex)
  } catch {
    return false
  }
}
