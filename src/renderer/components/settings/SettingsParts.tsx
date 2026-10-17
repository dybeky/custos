import { motion } from 'framer-motion'
import type { ReactNode } from 'react'

/** Heroicons-style outline paths for the Settings sections. */
export const SETTINGS_ICONS = {
  language:
    'M12 21a9 9 0 100-18 9 9 0 000 18zm0 0c2.2-2.4 3.4-5.4 3.4-9S14.2 5.4 12 3m0 18c-2.2-2.4-3.4-5.4-3.4-9S9.8 5.4 12 3M3.6 9h16.8M3.6 15h16.8',
  appearance:
    'M4.098 19.902a3.75 3.75 0 005.304 0l6.401-6.402M6.75 21A3.75 3.75 0 013 17.25V4.125C3 3.504 3.504 3 4.125 3h5.25c.621 0 1.125.504 1.125 1.125v4.072M6.75 21a3.75 3.75 0 003.75-3.75V8.197M6.75 21h13.125c.621 0 1.125-.504 1.125-1.125v-5.25c0-.621-.504-1.125-1.125-1.125h-4.072M10.5 8.197l2.88-2.88c.438-.439 1.15-.439 1.59 0l3.712 3.713c.44.44.44 1.152 0 1.59l-2.879 2.88M6.75 17.25h.008v.008H6.75v-.008z',
  sound:
    'M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z',
  privacy:
    'M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z',
  account:
    'M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z',
  about:
    'M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z'
} as const

export type SettingsIcon = keyof typeof SETTINGS_ICONS

export function SettingsGlyph({ name, className = 'w-4 h-4' }: { name: SettingsIcon; className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={SETTINGS_ICONS[name]} />
    </svg>
  )
}

/** One block of the Settings page: icon tile, title, one-line description, then its controls. */
export function SettingsSection({
  id,
  icon,
  title,
  desc,
  children
}: {
  id: string
  icon: SettingsIcon
  title: string
  desc?: string
  children: ReactNode
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="scroll-mt-4 rounded-2xl border border-[color:var(--line)] bg-panel/70 p-5"
    >
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-scan/25 bg-scan/10 text-scan">
          <SettingsGlyph name={icon} className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0">
          <h2 id={`${id}-title`} className="text-base font-semibold text-ink font-display">
            {title}
          </h2>
          {desc && <p className="mt-0.5 text-xs leading-relaxed text-ink-dim">{desc}</p>}
        </div>
      </div>
      {children}
    </section>
  )
}

/**
 * A whole row that is one switch: title, hint and an animated switch on the
 * right. The row lights up in the accent colour while it is on.
 */
export function SwitchRow({
  checked,
  onChange,
  title,
  desc,
  className = ''
}: {
  checked: boolean
  onChange: (next: boolean) => void
  title: string
  desc?: string
  className?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`flex w-full items-center justify-between gap-4 rounded-xl border px-4 py-3 text-left outline-none transition-colors focus-visible:ring-1 focus-visible:ring-scan/60 ${
        checked
          ? 'border-scan/30 bg-scan/[0.05] hover:border-scan/50'
          : 'border-[color:var(--line)] hover:border-[color:var(--line-strong)]'
      } ${className}`}
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink">{title}</span>
        {desc && <span className="mt-0.5 block text-[11px] leading-snug text-ink-dim">{desc}</span>}
      </span>
      <span
        className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors duration-200 ${
          checked ? 'border-scan bg-scan' : 'border-[color:var(--line-strong)] bg-panel-2'
        }`}
      >
        <motion.span
          className={`absolute top-0.5 h-4 w-4 rounded-full ${checked ? 'bg-on-accent' : 'bg-ink-dim'}`}
          initial={false}
          animate={{ x: checked ? 22 : 3 }}
          transition={{ type: 'spring', stiffness: 520, damping: 34 }}
        />
      </span>
    </button>
  )
}
