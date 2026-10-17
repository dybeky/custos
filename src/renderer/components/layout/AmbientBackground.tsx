import { useEffect, useRef } from 'react'
import { useSettingsStore } from '../../stores/settings-store'
import { AMBIENT_PALETTE, initialQuality, parseRgbChannels, stepQuality, type Rgb } from '../../../shared/ambient'

/**
 * Ambient layer behind the whole app: glowing orbs drifting upward and
 * breathing, fine dust, small pastel shapes swaying as they rise, an occasional
 * streak, pointer push/glow and a few sparks on click. Far items are drawn on a
 * half-resolution canvas blurred by CSS (depth of field). Quality drops when
 * frames come late; drawing stops while the window is hidden; with reduced
 * motion a single still frame is painted. Orbs follow the theme accent.
 */
const TAU = Math.PI * 2
type BitKind = 'ring' | 'dot' | 'square' | 'diamond' | 'plus'
const BIT_KINDS: BitKind[] = ['ring', 'dot', 'square', 'diamond', 'plus', 'ring', 'dot']
const REACH = 170
const BACK_SCALE = 0.5
const FAR = 0.55

interface Bit { x: number; y: number; size: number; kind: BitKind; color: string; rot: number; vr: number; vy: number; sway: number; phase: number; depth: number; alpha: number }
interface Orb { x: number; y: number; r: number; vx: number; vy: number; depth: number; phase: number; speed: number; alpha: number; accent: boolean; ox: number; oy: number }
interface Spark { x: number; y: number; vx: number; vy: number; life: number }
interface Streak { x: number; y: number; vx: number; vy: number; life: number }

const readVar = (name: string, fallback: Rgb): Rgb =>
  parseRgbChannels(getComputedStyle(document.documentElement).getPropertyValue(name), fallback)

export function AmbientBackground() {
  const colorTheme = useSettingsStore((s) => s.colorTheme)
  const canvas = useRef<HTMLCanvasElement>(null)
  const back = useRef<HTMLCanvasElement>(null)
  const goal = useRef<Rgb>([200, 255, 46])
  const ink = useRef<Rgb>([240, 240, 240])

  // Re-read the accent when the theme changes (after the data-theme attribute landed).
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      goal.current = readVar('--scan-rgb', goal.current)
      ink.current = readVar('--ink-rgb', ink.current)
    })
    return () => cancelAnimationFrame(id)
  }, [colorTheme])

  useEffect(() => {
    const el = canvas.current
    const bel = back.current
    const ctx = el?.getContext('2d')
    const bctx = bel?.getContext('2d')
    if (!el || !bel || !ctx || !bctx) return

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    goal.current = readVar('--scan-rgb', goal.current)
    ink.current = readVar('--ink-rgb', ink.current)
    const mix: Rgb = [...goal.current]
    let accent = ''
    let inkCol = ''

    let w = 0
    let h = 0
    let dpr = 1
    let px = 0
    let tpx = 0
    let raf = 0
    let last = 0
    let running = false
    let nextStreak = 4
    let quality = initialQuality(navigator.hardwareConcurrency)
    let late = 0
    let mx = -9999
    let my = -9999
    const streaks: Streak[] = []
    const sparks: Spark[] = []
    const orbs: Orb[] = []
    const bits: Bit[] = []
    const rand = (a: number, b: number) => a + Math.random() * (b - a)

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      w = window.innerWidth
      h = window.innerHeight
      el.width = Math.round(w * dpr)
      el.height = Math.round(h * dpr)
      el.style.width = `${w}px`
      el.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      bel.width = Math.round(el.width * BACK_SCALE)
      bel.height = Math.round(el.height * BACK_SCALE)
      bel.style.width = el.style.width
      bel.style.height = el.style.height
      bctx.setTransform(dpr * BACK_SCALE, 0, 0, dpr * BACK_SCALE, 0, 0)
    }
    resize()

    const small = w < 700
    const count = small ? 40 : 84
    for (let i = 0; i < count; i++) {
      const kind = i % 7 // 0 big soft orb, 1-2 medium, rest fine dust
      const depth = kind === 0 ? rand(0.2, 0.5) : kind < 3 ? rand(0.3, 0.9) : rand(0.4, 1)
      orbs.push({
        x: rand(0, w),
        y: rand(0, h),
        r: kind === 0 ? rand(26, 64) : kind < 3 ? rand(7, 16) : rand(0.7, 2),
        vx: rand(-4, 4),
        vy: -rand(4, kind === 0 ? 10 : 18),
        depth,
        phase: rand(0, TAU),
        speed: rand(0.6, 1.6),
        alpha: kind === 0 ? rand(0.07, 0.14) : kind < 3 ? rand(0.18, 0.34) : rand(0.3, 0.8),
        accent: kind < 3 ? Math.random() < 0.75 : depth > 0.6,
        ox: 0,
        oy: 0
      })
    }
    const bitCount = small ? 12 : 26
    for (let i = 0; i < bitCount; i++) {
      const depth = rand(0.25, 1)
      bits.push({
        x: rand(0, w),
        y: rand(0, h),
        size: rand(5, 13) * (0.7 + depth * 0.6),
        kind: BIT_KINDS[i % BIT_KINDS.length],
        color: AMBIENT_PALETTE[i % AMBIENT_PALETTE.length],
        rot: rand(0, TAU),
        vr: rand(-0.8, 0.8),
        vy: -rand(8, 22),
        sway: rand(0.4, 1.1),
        phase: rand(0, TAU),
        depth,
        alpha: rand(0.35, 0.8) * (0.55 + depth * 0.5)
      })
    }

    const drawBit = (c: CanvasRenderingContext2D, b: Bit, x: number, y: number) => {
      c.globalAlpha = b.alpha
      c.strokeStyle = b.color
      c.fillStyle = b.color
      c.lineWidth = 1.8
      c.save()
      c.translate(x, y)
      c.rotate(b.rot)
      const r = b.size
      c.beginPath()
      switch (b.kind) {
        case 'ring':
          c.arc(0, 0, r, 0, TAU)
          c.stroke()
          break
        case 'dot':
          c.arc(0, 0, r * 0.7, 0, TAU)
          c.fill()
          break
        case 'square':
          c.roundRect(-r, -r, r * 2, r * 2, r * 0.35)
          c.stroke()
          break
        case 'diamond':
          c.rotate(Math.PI / 4)
          c.roundRect(-r * 0.8, -r * 0.8, r * 1.6, r * 1.6, r * 0.3)
          c.stroke()
          break
        case 'plus':
          c.moveTo(-r, 0)
          c.lineTo(r, 0)
          c.moveTo(0, -r)
          c.lineTo(0, r)
          c.stroke()
          break
      }
      c.restore()
    }

    const draw = (dt: number, t: number) => {
      // The accent eases to the current theme colour.
      const k = Math.min(1, dt * 2.2)
      for (let i = 0; i < 3; i++) mix[i] += (goal.current[i] - mix[i]) * k
      accent = `rgb(${Math.round(mix[0])}, ${Math.round(mix[1])}, ${Math.round(mix[2])})`
      inkCol = `rgb(${ink.current[0]}, ${ink.current[1]}, ${ink.current[2]})`
      ctx.clearRect(0, 0, w, h)
      bctx.clearRect(0, 0, w, h)
      px += (tpx - px) * Math.min(1, dt * 3)

      for (let i = 0, n = Math.ceil(orbs.length * quality); i < n; i++) {
        const o = orbs[i]
        o.x += o.vx * dt
        o.y += o.vy * o.depth * dt
        const pad = o.r * 2 + 8
        const span = h + pad * 2
        if (o.y < -pad) {
          o.y += span
          o.x = rand(0, w)
        }
        if (o.x < -pad) o.x = w + pad
        if (o.x > w + pad) o.x = -pad

        const baseX = o.x + px * 40 * o.depth
        const baseY = ((((o.y + pad) % span) + span) % span) - pad
        let near = 0
        const dx = baseX + o.ox - mx
        const dy = baseY + o.oy - my
        const dist = Math.hypot(dx, dy)
        if (dist < REACH && dist > 0.5) {
          near = 1 - dist / REACH
          const push = near * near * 520 * dt * (0.4 + o.depth)
          o.ox += (dx / dist) * push
          o.oy += (dy / dist) * push
        }
        const fade = Math.max(0, 1 - dt * 1.6)
        o.ox *= fade
        o.oy *= fade
        const x = baseX + o.ox
        const y = baseY + o.oy
        const breathe = 0.7 + 0.3 * Math.sin(t * o.speed + o.phase)
        const c = o.depth < FAR ? bctx : ctx
        c.globalAlpha = Math.min(1, o.alpha * breathe * (1 + near * 1.6))
        const col = o.accent ? accent : inkCol
        if (o.r > 4) {
          const g = c.createRadialGradient(x, y, 0, x, y, o.r)
          g.addColorStop(0, col)
          g.addColorStop(0.35, col)
          g.addColorStop(1, 'transparent')
          c.fillStyle = g
        } else {
          c.fillStyle = col
        }
        c.beginPath()
        c.arc(x, y, o.r, 0, TAU)
        c.fill()
      }

      for (let i = 0, n = Math.ceil(bits.length * quality); i < n; i++) {
        const b = bits[i]
        b.y += b.vy * b.depth * dt
        b.rot += b.vr * dt
        const pad = b.size * 2 + 10
        const span = h + pad * 2
        const y = ((((b.y + pad) % span) + span) % span) - pad
        const x = b.x + Math.sin(t * b.sway + b.phase) * 16 + px * 55 * b.depth
        drawBit(b.depth < FAR ? bctx : ctx, b, x, y)
      }

      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i]
        s.x += s.vx * dt
        s.y += s.vy * dt
        s.vx *= 1 - dt * 2.2
        s.vy *= 1 - dt * 2.2
        s.life -= dt * 1.3
        if (s.life <= 0) {
          sparks.splice(i, 1)
          continue
        }
        ctx.globalAlpha = s.life * 0.9
        ctx.fillStyle = accent
        ctx.beginPath()
        ctx.arc(s.x, s.y, 1 + s.life * 1.6, 0, TAU)
        ctx.fill()
      }

      nextStreak -= dt
      if (nextStreak <= 0 && streaks.length < 2) {
        nextStreak = rand(6, 13)
        const fromLeft = Math.random() < 0.5
        streaks.push({
          x: fromLeft ? rand(-50, w * 0.3) : rand(w * 0.7, w + 50),
          y: rand(0, h * 0.5),
          vx: (fromLeft ? 1 : -1) * rand(520, 760),
          vy: rand(120, 260),
          life: 1
        })
      }
      for (let i = streaks.length - 1; i >= 0; i--) {
        const s = streaks[i]
        s.x += s.vx * dt
        s.y += s.vy * dt
        s.life -= dt * 0.9
        if (s.life <= 0) {
          streaks.splice(i, 1)
          continue
        }
        const len = 0.11
        const g = ctx.createLinearGradient(s.x, s.y, s.x - s.vx * len, s.y - s.vy * len)
        g.addColorStop(0, accent)
        g.addColorStop(1, 'transparent')
        ctx.globalAlpha = Math.min(1, s.life) * 0.55
        ctx.strokeStyle = g
        ctx.lineWidth = 1.4
        ctx.beginPath()
        ctx.moveTo(s.x, s.y)
        ctx.lineTo(s.x - s.vx * len, s.y - s.vy * len)
        ctx.stroke()
      }
      ctx.globalAlpha = 1
      bctx.globalAlpha = 1
    }

    const loop = (now: number) => {
      if (!running) return
      const dt = Math.min(0.05, (now - last) / 1000 || 0.016)
      last = now
      const q = stepQuality(quality, late, dt)
      quality = q.quality
      late = q.late
      draw(dt, now / 1000)
      raf = requestAnimationFrame(loop)
    }
    const start = () => {
      if (running || reduced) return
      running = true
      last = performance.now()
      raf = requestAnimationFrame(loop)
    }
    const stop = () => {
      running = false
      cancelAnimationFrame(raf)
    }

    const onMove = (e: PointerEvent) => {
      tpx = e.clientX / w - 0.5
      mx = e.clientX
      my = e.clientY
    }
    const onLeave = () => {
      mx = my = -9999
    }
    const onDown = (e: PointerEvent) => {
      if (reduced || sparks.length > 60) return
      for (let i = 0; i < 14; i++) {
        const a = rand(0, TAU)
        const v = rand(60, 260)
        sparks.push({ x: e.clientX, y: e.clientY, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1 })
      }
    }
    const onVisible = () => (document.hidden ? stop() : start())

    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('resize', resize)
    window.addEventListener('pointerdown', onDown, { passive: true })
    document.documentElement.addEventListener('pointerleave', onLeave)
    document.addEventListener('visibilitychange', onVisible)
    if (reduced) draw(0, 0)
    else start()

    return () => {
      stop()
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointerdown', onDown)
      document.documentElement.removeEventListener('pointerleave', onLeave)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
      <canvas ref={back} className="absolute left-0 top-0" style={{ filter: 'blur(3px)' }} />
      <canvas ref={canvas} className="absolute left-0 top-0" />
    </div>
  )
}
