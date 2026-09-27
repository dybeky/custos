import { useTranslation } from 'react-i18next'
import type { UiMode } from '../../../shared/types'
import { useSettingsStore } from '../../stores/settings-store'

/** Miniature of the classic layout: icon sidebar + stacked cards. */
function ClassicPreview() {
  return (
    <div className="h-full w-full flex bg-[#0a0908]">
      <div className="w-4 border-r border-white/5 flex flex-col items-center gap-1 pt-2">
        {[0, 1, 2, 3].map((i) => <span key={i} className={`w-2 h-2 rounded-sm ${i === 1 ? 'bg-scan/70' : 'bg-white/10'}`} />)}
      </div>
      <div className="flex-1 p-2 flex flex-col gap-1.5">
        <div className="h-6 rounded bg-white/[0.06] flex items-center justify-center"><span className="w-10 h-1.5 rounded bg-scan/60" /></div>
        <div className="h-3 rounded bg-white/[0.05]" />
        <div className="h-3 rounded bg-white/[0.05]" />
        <div className="h-3 rounded bg-white/[0.05]" />
      </div>
    </div>
  )
}

/** Miniature of the modern layout: top nav + verdict rail + evidence pane. */
function ModernPreview() {
  return (
    <div className="h-full w-full flex flex-col bg-[#0a0908]">
      <div className="h-3 border-b border-white/5 flex items-center justify-center gap-1">
        {[0, 1, 2].map((i) => <span key={i} className={`w-3 h-1 rounded-full ${i === 0 ? 'bg-white/40' : 'bg-white/10'}`} />)}
      </div>
      <div className="flex-1 p-1.5 flex gap-1.5">
        <div className="w-[38%] rounded bg-white/[0.05] flex flex-col items-center pt-1.5 gap-1">
          <span className="w-6 h-3 rounded-t-full border-2 border-b-0 border-alert/70" />
          <span className="w-8 h-1 rounded bg-white/10" />
          <span className="w-8 h-1.5 rounded bg-scan/60 mt-auto mb-1.5" />
        </div>
        <div className="flex-1 rounded bg-white/[0.05] p-1 flex flex-col gap-1">
          <span className="h-1.5 w-2/3 rounded bg-alert/40" />
          <span className="h-1.5 rounded bg-white/10" />
          <span className="h-1.5 rounded bg-white/10" />
          <span className="h-1.5 w-4/5 rounded bg-white/10" />
        </div>
      </div>
    </div>
  )
}

const OPTIONS: Array<{ id: UiMode; Preview: () => React.JSX.Element }> = [
  { id: 'classic', Preview: ClassicPreview },
  { id: 'modern', Preview: ModernPreview }
]

/** Two selectable tiles with live miniatures; switching applies instantly. */
export function InterfacePicker() {
  const { t } = useTranslation()
  const { uiMode, setUiMode } = useSettingsStore()
  return (
    <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label={t('settings.interface.title')}>
      {OPTIONS.map(({ id, Preview }) => {
        const active = uiMode === id
        return (
          <button
            key={id}
            role="radio"
            aria-checked={active}
            onClick={() => setUiMode(id)}
            className={`text-left rounded-2xl p-2 border transition-colors ${
              active ? 'border-scan bg-scan/[0.06]' : 'border-[color:var(--line)] hover:border-[color:var(--line-strong)]'
            }`}
          >
            <div className="h-24 rounded-xl overflow-hidden border border-white/5">
              <Preview />
            </div>
            <div className="px-1.5 pt-2.5 pb-1 flex items-start gap-2">
              <span className={`mt-0.5 w-3.5 h-3.5 rounded-full border-2 shrink-0 ${active ? 'border-scan bg-scan shadow-[inset_0_0_0_2px_var(--bg)]' : 'border-ink-dim/50'}`} />
              <span>
                <span className="block text-sm font-medium text-ink">
                  {t(`settings.interface.${id}`)}
                  {id === 'modern' && (
                    <span className="ml-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide bg-scan/15 text-scan align-middle">
                      {t('settings.interface.new')}
                    </span>
                  )}
                </span>
                <span className="block mt-0.5 text-xs text-ink-dim">{t(`settings.interface.${id}Desc`)}</span>
              </span>
            </div>
          </button>
        )
      })}
    </div>
  )
}
