import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { fuzzyMatch, useModernCommands, type Command } from '../commands'
import { IconSearch } from '../icons'

const GROUP_ORDER: Command['group'][] = ['actions', 'navigate', 'preferences']

/**
 * Ctrl+K command palette: type to filter, arrows to move, Enter to run,
 * Esc to close. Everything the shell can do is reachable from here.
 */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const commands = useModernCommands()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const filtered = useMemo(() => {
    const hits = commands.filter((c) => fuzzyMatch(query, `${c.label} ${c.keywords ?? ''}`))
    return GROUP_ORDER.flatMap((g) => hits.filter((c) => c.group === g))
  }, [commands, query])

  useEffect(() => {
    if (open) {
      setQuery('')
      setActive(0)
      // Focus after the enter animation mounts the input.
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  useEffect(() => setActive(0), [query])

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const run = (cmd: Command | undefined) => {
    if (!cmd) return
    onClose()
    cmd.run()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, filtered.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); run(filtered[active]) }
    else if (e.key === 'Escape') { e.preventDefault(); onClose() }
  }

  let lastGroup: string | null = null

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-start justify-center pt-[14vh] bg-black/50 backdrop-blur-sm"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}
          onMouseDown={onClose}
        >
          <motion.div
            role="dialog"
            aria-label={t('modern.palette.open')}
            className="ui-modern w-[min(560px,92vw)] m-surface !bg-panel shadow-2xl overflow-hidden"
            initial={{ y: -8, scale: 0.98 }} animate={{ y: 0, scale: 1 }} exit={{ y: -8, scale: 0.98 }} transition={{ duration: 0.14 }}
            onMouseDown={(e) => e.stopPropagation()}
            onKeyDown={onKeyDown}
          >
            <div className="flex items-center gap-2.5 px-4 h-12 border-b border-[color:var(--line)]">
              <IconSearch className="w-4 h-4 text-ink-dim" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('modern.palette.placeholder')}
                className="flex-1 bg-transparent text-sm text-ink placeholder:text-ink-dim/60 focus:outline-none"
                aria-activedescendant={filtered[active] ? `cmd-${filtered[active].id}` : undefined}
              />
              <span className="m-kbd">Esc</span>
            </div>
            <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-1.5" role="listbox">
              {filtered.length === 0 && (
                <p className="px-3 py-6 text-center text-sm text-ink-dim">{t('modern.palette.empty')}</p>
              )}
              {filtered.map((cmd, i) => {
                const header = cmd.group !== lastGroup
                lastGroup = cmd.group
                return (
                  <div key={cmd.id}>
                    {header && (
                      <p className="px-3 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-dim/70">
                        {t(`modern.palette.group.${cmd.group}`)}
                      </p>
                    )}
                    <button
                      id={`cmd-${cmd.id}`}
                      data-index={i}
                      role="option"
                      aria-selected={i === active}
                      onMouseMove={() => setActive(i)}
                      onClick={() => run(cmd)}
                      className={`w-full flex items-center justify-between gap-3 px-3 h-9 rounded-lg text-left text-sm transition-colors ${
                        i === active ? 'bg-panel-2 text-ink' : 'text-ink-dim'
                      }`}
                    >
                      <span className="truncate">{cmd.label}</span>
                      {cmd.shortcut && <span className="m-kbd shrink-0">{cmd.shortcut}</span>}
                    </button>
                  </div>
                )
              })}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}
