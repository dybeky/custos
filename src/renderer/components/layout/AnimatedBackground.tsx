import { motion } from 'framer-motion'
import { useSettingsStore } from '../../stores/settings-store'

// Floating particles - spread across different starting positions
const particles = Array.from({ length: 30 }, (_, i) => ({
  id: i,
  size: Math.random() * 4 + 2,
  x: Math.random() * 100,
  startY: Math.random() * 200 - 50, // Start from different Y positions (-50% to 150%)
  duration: Math.random() * 15 + 10,
  opacity: Math.random() * 0.5 + 0.3,
  drift: (Math.random() - 0.5) * 100, // Random horizontal drift
}))

export function AnimatedBackground() {
  const { effectsEnabled } = useSettingsStore()

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
      {/* Animated gradient background - always visible */}
      <div
        className="absolute inset-0 opacity-30 animate-gradient-bg"
        style={{
          background: 'linear-gradient(45deg, #c6a2e8, #515ef5, #c6a2e8, #515ef5)',
          backgroundSize: '400% 400%',
        }}
      />

      {/* Purple blob */}
      <div
        className="absolute w-[600px] h-[600px] rounded-full opacity-20 blur-[120px] animate-blob-1"
        style={{
          background: 'radial-gradient(circle, #c6a2e8 0%, transparent 70%)',
          left: '10%',
          top: '20%'
        }}
      />

      {/* Blue blob */}
      <div
        className="absolute w-[500px] h-[500px] rounded-full opacity-20 blur-[100px] animate-blob-2"
        style={{
          background: 'radial-gradient(circle, #515ef5 0%, transparent 70%)',
          right: '15%',
          top: '30%'
        }}
      />

      {/* Purple blob 2 */}
      <div
        className="absolute w-[400px] h-[400px] rounded-full opacity-15 blur-[80px] animate-blob-3"
        style={{
          background: 'radial-gradient(circle, #c6a2e8 0%, transparent 70%)',
          left: '30%',
          bottom: '20%'
        }}
      />

      {/* Blue blob 2 */}
      <div
        className="absolute w-[350px] h-[350px] rounded-full opacity-15 blur-[90px] animate-blob-4"
        style={{
          background: 'radial-gradient(circle, #515ef5 0%, transparent 70%)',
          right: '25%',
          bottom: '30%'
        }}
      />

      {/* Floating particles - can be toggled */}
      {effectsEnabled && (
        <div className="absolute inset-0">
          {particles.map((particle) => (
            <motion.div
              key={particle.id}
              className="absolute rounded-full"
              style={{
                width: particle.size,
                height: particle.size,
                left: `${particle.x}%`,
                background: particle.id % 2 === 0
                  ? 'radial-gradient(circle, #c6a2e8 0%, transparent 70%)'
                  : 'radial-gradient(circle, #515ef5 0%, transparent 70%)',
                boxShadow: `0 0 ${particle.size * 2}px ${particle.id % 2 === 0 ? '#c6a2e8' : '#515ef5'}`,
                opacity: particle.opacity,
              }}
              initial={{ y: `${particle.startY}vh`, x: 0 }}
              animate={{ y: '-120vh', x: particle.drift }}
              transition={{
                duration: particle.duration,
                repeat: Infinity,
                ease: 'linear',
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
