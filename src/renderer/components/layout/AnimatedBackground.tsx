import { motion } from 'framer-motion'
import { useSettingsStore } from '../../stores/settings-store'
import { useScanStore } from '../../stores/scan-store'

// Periwinkle forensic-console palette
const palette = {
  periwinkle: 'rgba(128,168,255,',  // --scan
  purple: 'rgba(206,181,255,'       // accent
}

// Two large, soft glows that drift slowly — depth without distraction.
// Anchored to match the website's radial periwinkle glow motif.
const glows = [
  {
    color: `${palette.periwinkle}1)`,
    size: 900,
    top: '-18%',
    left: '-12%',
    duration: 42,
    x: [0, 40, 0],
    y: [0, 30, 0]
  },
  {
    color: `${palette.purple}1)`,
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
      {/* Radial periwinkle glows — website motif */}
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

      {/* Scan-line gradient overlay — forensic console texture */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(128,168,255,0.015) 2px, rgba(128,168,255,0.015) 4px)',
          backgroundSize: '100% 4px'
        }}
      />

      {/* Vignette to focus the center */}
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(ellipse at 50% 40%, transparent 55%, rgba(13,15,31,0.65) 100%)' }}
      />
    </div>
  )
}
