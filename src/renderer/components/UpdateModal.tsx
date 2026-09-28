import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal } from './ui/Modal'
import { Button } from './ui/Button'
import type { UpdateInfo, UpdateProgress } from '../../shared/types'
import { alpha } from '../utils/color'

// Accent color per changelog group — keeps the emoji-free changelog readable.
const ACCENT: Record<string, string> = {
  New: 'var(--scan)',
  Fixes: 'var(--ok)',
  Performance: 'var(--scan-dim)',
  Improvements: 'var(--scan-dim)'
}
const ACCENT_DEFAULT = 'var(--scan)'

type Phase = { kind: 'idle' } | { kind: 'downloading'; progress: UpdateProgress | null } | { kind: 'restarting' } | { kind: 'failed'; message: string }

const mb = (bytes: number): string => (bytes / (1024 * 1024)).toFixed(1)

export function UpdateModal({ info, onClose }: { info: UpdateInfo; onClose: () => void }) {
  const { t } = useTranslation()
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const busy = phase.kind === 'downloading' || phase.kind === 'restarting'

  useEffect(
    () => window.electronAPI.onUpdateProgress((p) => setPhase({ kind: 'downloading', progress: p })),
    []
  )

  const install = async () => {
    setPhase({ kind: 'downloading', progress: null })
    try {
      await window.electronAPI.installUpdate()
      setPhase({ kind: 'restarting' })
    } catch (err) {
      // ipcRenderer.invoke wraps main's error: "Error invoking remote method '…': Error: <message>"
      const raw = err instanceof Error ? err.message : String(err)
      setPhase({ kind: 'failed', message: raw.replace(/^.*?Error: /, '') })
    }
  }

  const openPage = () => {
    if (info.url) window.electronAPI.openExternal(info.url)
    onClose()
  }

  const pct = phase.kind === 'downloading' && phase.progress ? Math.round((phase.progress.received / phase.progress.total) * 100) : 0

  return (
    <Modal isOpen onClose={busy ? () => {} : onClose} showCloseButton={!busy} title={t('update.title')} size="md">
      <p className="text-sm text-ink-dim mb-3">
        {t('update.newVersion', { version: info.latestVersion })}
      </p>
      <div className="space-y-4 max-h-64 overflow-y-auto mb-4">
        {info.notes.map((group) => {
          const accent = ACCENT[group.group] ?? ACCENT_DEFAULT
          return (
            <div key={group.group}>
              <div className="flex items-center gap-2 mb-1.5">
                <span
                  className="h-3 w-1 rounded-full shrink-0"
                  style={{ backgroundColor: accent, boxShadow: `0 0 8px ${alpha(accent, 0.4)}` }}
                />
                <h3
                  className="text-2xs font-bold tracking-[0.18em] uppercase font-display"
                  style={{ color: accent }}
                >
                  {group.group}
                </h3>
              </div>
              <ul className="space-y-1 pl-3">
                {group.entries.map((e) => (
                  <li key={e.sha} className="text-sm text-ink flex gap-2.5 items-start">
                    <span
                      className="mt-1.5 w-1 h-1 rounded-full shrink-0"
                      style={{ backgroundColor: accent }}
                    />
                    <span className="leading-snug">{e.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </div>

      {phase.kind === 'downloading' && (
        <div className="mb-4" role="status" aria-live="polite">
          <div className="h-1.5 w-full rounded-full bg-panel-2 overflow-hidden">
            <div className="h-full rounded-full bg-scan transition-[width] duration-200" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1.5 text-xs text-ink-dim tabular-nums">
            {phase.progress
              ? t('update.downloading', { received: mb(phase.progress.received), total: mb(phase.progress.total), pct })
              : t('update.starting')}
          </p>
        </div>
      )}
      {phase.kind === 'restarting' && (
        <p className="mb-4 text-xs text-ok" role="status">{t('update.restarting')}</p>
      )}
      {phase.kind === 'failed' && (
        <p className="mb-4 text-xs text-amber" role="alert">{t('update.failed', { message: phase.message })}</p>
      )}

      <div className="flex justify-end gap-2">
        {!busy && <Button variant="secondary" size="sm" onClick={onClose}>{t('update.later')}</Button>}
        {info.canInstall && phase.kind !== 'failed' ? (
          <Button variant="primary" size="sm" disabled={busy} onClick={() => void install()}>
            {t('update.install')}
          </Button>
        ) : (
          <Button variant="primary" size="sm" onClick={openPage}>{t('update.download')}</Button>
        )}
      </div>
      {info.canInstall && phase.kind === 'idle' && (
        <p className="mt-3 text-2xs text-ink-dim text-right">{t('update.installHint')}</p>
      )}
    </Modal>
  )
}
