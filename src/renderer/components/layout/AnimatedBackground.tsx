import { motion } from 'framer-motion'
import { useSettingsStore, ThemeName } from '../../stores/settings-store'

// Theme configurations
const themeConfigs: Record<ThemeName, {
  gradient: string
  blob1: string
  blob2: string
  particle1: string
  particle2: string
}> = {
  aurora: {
    gradient: 'linear-gradient(45deg, #c6a2e8, #515ef5, #c6a2e8, #515ef5)',
    blob1: '#c6a2e8',
    blob2: '#515ef5',
    particle1: '#c6a2e8',
    particle2: '#515ef5'
  },
  mono: {
    gradient: 'linear-gradient(45deg, #ffffff, #444444, #ffffff, #444444)',
    blob1: '#ffffff',
    blob2: '#666666',
    particle1: '#ffffff',
    particle2: '#888888'
  },
  tropical: {
    gradient: 'linear-gradient(45deg, #c0ed85, #fad098, #76a6f5, #c0ed85)',
    blob1: '#c0ed85',
    blob2: '#fad098',
    particle1: '#c0ed85',
    particle2: '#76a6f5'
  }
}

// Floating particles
const particles = Array.from({ length: 30 }, (_, i) => ({
  id: i,
  size: Math.random() * 4 + 2,
  x: Math.random() * 100,
  startY: Math.random() * 200 - 50,
  duration: Math.random() * 15 + 10,
  opacity: Math.random() * 0.5 + 0.3,
  drift: (Math.random() - 0.5) * 100,
}))

export function AnimatedBackground() {
  const { effectsEnabled, theme } = useSettingsStore()
  const config = themeConfigs[theme]

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
      {/* Animated gradient background */}
      <div
        className="absolute inset-0 opacity-30 animate-gradient-bg"
        style={{
          background: config.gradient,
          backgroundSize: '400% 400%',
        }}
      />

      {/* Blob 1 */}
      <div
        className={`absolute w-[600px] h-[600px] rounded-full opacity-20 blur-[120px] ${
          theme === 'mono' ? 'mono-fade' : 'animate-blob-1'
        }`}
        style={{
          background: `radial-gradient(circle, ${config.blob1} 0%, transparent 70%)`,
          left: '10%',
          top: '20%'
        }}
      />

      {/* Blob 2 */}
      <div
        className={`absolute w-[500px] h-[500px] rounded-full opacity-20 blur-[100px] ${
          theme === 'mono' ? 'mono-pulse' : 'animate-blob-2'
        }`}
        style={{
          background: `radial-gradient(circle, ${config.blob2} 0%, transparent 70%)`,
          right: '15%',
          top: '30%'
        }}
      />

      {/* Blob 3 */}
      <div
        className={`absolute w-[400px] h-[400px] rounded-full opacity-15 blur-[80px] ${
          theme === 'mono' ? 'mono-fade' : 'animate-blob-3'
        }`}
        style={{
          background: `radial-gradient(circle, ${config.blob1} 0%, transparent 70%)`,
          left: '30%',
          bottom: '20%',
          animationDelay: theme === 'mono' ? '-2s' : '0s'
        }}
      />

      {/* Blob 4 */}
      <div
        className={`absolute w-[350px] h-[350px] rounded-full opacity-15 blur-[90px] ${
          theme === 'mono' ? 'mono-pulse' : 'animate-blob-4'
        }`}
        style={{
          background: `radial-gradient(circle, ${config.blob2} 0%, transparent 70%)`,
          right: '25%',
          bottom: '30%',
          animationDelay: theme === 'mono' ? '-3s' : '0s'
        }}
      />

      {/* Floating particles */}
      {effectsEnabled && (
        <div className="absolute inset-0">
          {particles.map((particle) => (
            <motion.div
              key={particle.id}
              className={`absolute rounded-full ${
                theme === 'mono' ? 'mono-particle' : ''
              }`}
              style={{
                width: particle.size,
                height: particle.size,
                left: `${particle.x}%`,
                background: particle.id % 2 === 0
                  ? `radial-gradient(circle, ${config.particle1} 0%, transparent 70%)`
                  : `radial-gradient(circle, ${config.particle2} 0%, transparent 70%)`,
                boxShadow: `0 0 ${particle.size * 2}px ${particle.id % 2 === 0 ? config.particle1 : config.particle2}`,
                opacity: particle.opacity,
              }}
              initial={{ y: `${particle.startY}vh`, x: 0 }}
              animate={{
                y: '-120vh',
                x: theme === 'mono'
                  ? [0, particle.drift * 0.5, particle.drift, particle.drift * 0.5, 0]
                  : particle.drift
              }}
              transition={{
                duration: particle.duration,
                repeat: Infinity,
                ease: theme === 'mono' ? 'easeInOut' : 'linear',
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
