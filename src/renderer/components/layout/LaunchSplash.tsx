import { motion, useReducedMotion } from 'framer-motion'
import { CustosMark } from '../ui/CustosMark'

const WORD = 'custos'

/** How long the intro plays before it may leave (the app must also be ready). */
export const SPLASH_MIN_MS = 1500

/**
 * Launch intro, over the app while it loads: the sword is traced in, a glow
 * blooms behind it, the wordmark rises letter by letter and a light sweeps
 * the rule beneath. The parent unmounts it inside <AnimatePresence>, which
 * plays the exit (a soft lift and fade revealing the app).
 */
export function LaunchSplash() {
  const reduce = useReducedMotion()

  return (
    <motion.div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-bg overflow-hidden"
      initial={{ opacity: 1 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 1.04, filter: 'blur(6px)' }}
      transition={{ duration: 0.45, ease: [0.4, 0, 0.2, 1] }}
      aria-hidden="true"
    >
      {/* Ambient grid + vignette */}
      <div
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            'linear-gradient(var(--ink) 1px, transparent 1px), linear-gradient(90deg, var(--ink) 1px, transparent 1px)',
          backgroundSize: '44px 44px',
          maskImage: 'radial-gradient(circle at center, black 0%, transparent 65%)',
          WebkitMaskImage: 'radial-gradient(circle at center, black 0%, transparent 65%)'
        }}
      />

      <div className="relative flex flex-col items-center">
        {/* Glow bloom */}
        <motion.div
          className="absolute top-2 w-56 h-56 rounded-full blur-3xl"
          style={{ background: 'radial-gradient(circle, rgba(var(--glow),.45), transparent 70%)' }}
          initial={{ opacity: 0, scale: 0.4 }}
          animate={{ opacity: [0, 1, 0.55], scale: [0.4, 1.15, 1] }}
          transition={{ duration: 1.1, delay: 0.35, ease: 'easeOut' }}
        />

        {/* Emblem */}
        <motion.div
          className="relative w-20 h-20 rounded-[22px] flex items-center justify-center bg-panel border border-[color:var(--line-strong)]"
          initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.6, rotate: -8 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.05 }}
        >
          <CustosMark className="w-12 h-12" draw={!reduce} delay={0.15} />
          {/* Ring pulse */}
          {!reduce && (
            <motion.span
              className="absolute inset-0 rounded-[22px] border border-scan"
              initial={{ opacity: 0.8, scale: 1 }}
              animate={{ opacity: 0, scale: 1.6 }}
              transition={{ duration: 0.9, delay: 0.75, ease: 'easeOut' }}
            />
          )}
        </motion.div>

        {/* Wordmark */}
        <div className="relative mt-6 flex text-4xl font-bold tracking-[0.08em] text-ink font-display">
          {WORD.split('').map((ch, i) => (
            <motion.span
              key={i}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14, filter: 'blur(8px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              transition={{ duration: 0.45, delay: 0.5 + i * 0.055, ease: [0.22, 1, 0.36, 1] }}
            >
              {ch}
            </motion.span>
          ))}
        </div>

        {/* Rule with a sweeping light */}
        <div className="relative mt-4 w-40 h-px bg-[color:var(--line)] overflow-hidden">
          <motion.div
            className="absolute inset-y-0 w-1/2"
            style={{ background: 'linear-gradient(90deg, transparent, var(--scan), transparent)' }}
            initial={{ x: '-100%' }}
            animate={{ x: '200%' }}
            transition={{ duration: 0.9, delay: 0.75, ease: [0.65, 0, 0.35, 1] }}
          />
        </div>

        <motion.p
          className="mt-3 text-[10px] font-semibold tracking-[0.45em] uppercase text-ink-dim"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.95 }}
        >
          anti-cheat
        </motion.p>
      </div>
    </motion.div>
  )
}
