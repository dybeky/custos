import { useSyncExternalStore } from 'react'
import { isRgbBorderEnabled, subscribeRgbBorder } from '../../utils/rgb-border'

/** Running RGB light around the window edge (see .rgb-border in index.css). */
export function RgbBorder() {
  const on = useSyncExternalStore(subscribeRgbBorder, isRgbBorderEnabled)
  if (!on) return null
  return (
    <div className="rgb-border" aria-hidden="true">
      <span />
    </div>
  )
}
