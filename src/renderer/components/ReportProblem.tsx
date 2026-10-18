import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Modal } from './ui/Modal'
import { Button } from './ui/Button'
import { useScanStore } from '../stores/scan-store'
import { useGameStore } from '../stores/game-store'
import { radioGroupKeys } from '../utils/radio-keys'
import type { ProblemReportPayload } from '../../shared/types'

type Kind = ProblemReportPayload['kind']
const KINDS: readonly Kind[] = ['app', 'scanner', 'other']
const TITLE_MAX = 120
const DETAILS_MAX = 2000

const field =
  'w-full rounded-lg border border-[color:var(--line)] bg-bg px-3 py-2 text-sm text-ink outline-none transition-colors placeholder:text-ink-dim/60 focus:border-scan/60'

/** Where the window is, as a short word for the report ('scan', 'results', ...). */
const pageOf = (pathname: string): string => pathname.split('/')[1] || 'dashboard'

/**
 * The red "Report a problem" button of the header and its form. Opened during a
 * scan or on the results it starts as a scanner problem and adds the names of
 * the scanners (which ran, which failed) — names only, never results.
 */
export function ReportProblem() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const results = useScanStore((s) => s.results)
  const game = useGameStore((s) => s.selectedGame)
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<Kind>('app')
  const [title, setTitle] = useState('')
  const [details, setDetails] = useState('')
  const [contact, setContact] = useState('')
  const [sending, setSending] = useState(false)
  const [state, setState] = useState<'form' | 'sent'>('form')
  const [error, setError] = useState('')

  const page = pageOf(pathname)
  const onScanPage = page === 'scan' || page === 'results'

  const show = (): void => {
    setKind(onScanPage ? 'scanner' : 'app')
    setError('')
    setState('form')
    setOpen(true)
  }
  const close = (): void => {
    setOpen(false)
    if (state === 'sent') {
      setTitle('')
      setDetails('')
      setContact('')
    }
  }

  const valid = title.trim().length >= 3 && details.trim().length >= 10
  const send = async (): Promise<void> => {
    if (!valid || sending) return
    setSending(true)
    setError('')
    const failed = results.filter((r) => !r.success).map((r) => r.scannerName)
    const ran = results.filter((r) => r.success).map((r) => r.scannerName)
    const res = await window.electronAPI
      .sendProblemReport({
        kind,
        title: title.trim(),
        details: details.trim(),
        ...(contact.trim() ? { contact: contact.trim() } : {}),
        page,
        ...(game ? { game } : {}),
        ...(onScanPage && (failed.length || ran.length) ? { failedScanners: failed.slice(0, 30), scanners: ran.slice(0, 30) } : {})
      })
      .catch(() => ({ ok: false, error: 'failed' as const }))
    setSending(false)
    if (res.ok) setState('sent')
    else setError(t(`problem.errors.${res.error ?? 'failed'}`, { defaultValue: t('problem.errors.failed') }))
  }

  const keys = radioGroupKeys(KINDS, kind, setKind)

  return (
    <>
      <button
        onClick={show}
        title={t('problem.button')}
        className="mr-1 flex items-center gap-1.5 h-6 px-2.5 rounded-full border border-alert/50 bg-alert/15 text-[11px] font-semibold text-alert font-display hover:bg-alert/25 transition-colors outline-none focus-visible:ring-1 focus-visible:ring-alert/60"
      >
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.3 3.9L2.4 17.5A2 2 0 004.1 20.5h15.8a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" />
        </svg>
        {t('problem.button')}
      </button>

      <Modal isOpen={open} onClose={close} title={t('problem.title')} size="lg">
        {state === 'sent' ? (
          <div className="text-center py-4">
            <p className="text-sm font-semibold text-ink">{t('problem.sentTitle')}</p>
            <p className="mt-1 text-xs text-ink-dim">{t('problem.sentBody')}</p>
            <Button className="mt-5" onClick={close}>{t('problem.close')}</Button>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void send()
            }}
            className="space-y-4"
          >
            <div role="radiogroup" aria-label={t('problem.kindLabel')} onKeyDown={keys.onKeyDown} className="flex gap-2">
              {KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={kind === k}
                  tabIndex={keys.tabIndexOf(k)}
                  onClick={() => setKind(k)}
                  className={`flex-1 h-9 rounded-lg border text-xs font-semibold outline-none transition-colors focus-visible:ring-1 focus-visible:ring-scan/60 ${
                    kind === k ? 'border-alert/50 bg-alert/10 text-alert' : 'border-[color:var(--line)] text-ink-dim hover:text-ink'
                  }`}
                >
                  {t(`problem.kind.${k}`)}
                </button>
              ))}
            </div>

            <label className="block">
              <span className="text-xs font-medium text-ink">{t('problem.whatLabel')}</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={TITLE_MAX}
                placeholder={t('problem.whatPlaceholder')}
                className={`${field} mt-1.5 h-10`}
              />
            </label>

            <label className="block">
              <span className="text-xs font-medium text-ink">{t('problem.detailsLabel')}</span>
              <textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                maxLength={DETAILS_MAX}
                rows={5}
                placeholder={t('problem.detailsPlaceholder')}
                className={`${field} mt-1.5 resize-none`}
              />
              <span className="mt-1 block text-right text-[10px] tabular-nums text-ink-dim">{details.length} / {DETAILS_MAX}</span>
            </label>

            <label className="block">
              <span className="text-xs font-medium text-ink">{t('problem.contactLabel')}</span>
              <input
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                maxLength={120}
                placeholder={t('problem.contactPlaceholder')}
                className={`${field} mt-1.5 h-10`}
              />
            </label>

            <p className="text-[11px] leading-relaxed text-ink-dim">{t('problem.privacy')}</p>
            {error && <p role="alert" className="text-xs text-alert">{error}</p>}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={close}>{t('problem.cancel')}</Button>
              <Button type="submit" variant="danger" disabled={!valid} isLoading={sending} loadingText={t('problem.sending')}>
                {t('problem.send')}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  )
}
