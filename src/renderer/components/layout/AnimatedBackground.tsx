import { motion } from 'framer-motion'
import { useSettingsStore } from '../../stores/settings-store'
import { useScanStore } from '../../stores/scan-store'

// Single pastel palette — the only color set in the app
const palette = {
  purple: '#CEB5FF',
  blue: '#80A8FF'
}

// Two large, soft glows anchored in opposite corners. They drift only a few
// dozen pixels over ~40s, so the field reads as calm and near-static — depth
// without distraction.
const glows = [
  {
    color: palette.blue,
    size: 900,
    top: '-18%',
    left: '-12%',
    duration: 42,
    x: [0, 40, 0],
    y: [0, 30, 0]
  },
  {
    color: palette.purple,
    size: 820,
    top: '52%',
    left: '58%',
    duration: 50,
    x: [0, -35, 0],
    y: [0, -25, 0]
  }
]

export function AnimatedBackground() {
  const effectsEnabled = useSettingsStore(state => state.effectsEnabled)
  const scanStatus = useScanStore(state => state.status)

  // While scanning, freeze motion entirely to save CPU/GPU.
  const animated = effectsEnabled && scanStatus !== 'scanning'

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
      {glows.map((glow, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full blur-[160px]"
          style={{
            width: glow.size,
            height: glow.size,
            top: glow.top,
            left: glow.left,
            background: `radial-gradient(circle, ${glow.color} 0%, transparent 70%)`,
            opacity: 0.14,
            willChange: animated ? 'transform' : 'auto'
          }}
          animate={animated ? { x: glow.x, y: glow.y } : undefined}
          transition={{ duration: glow.duration, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}

      {/* Subtle vignette to settle the edges and focus the center */}
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(ellipse at 50% 40%, transparent 60%, rgba(10,11,18,0.6) 100%)' }}
      />
    </div>
  )
}
