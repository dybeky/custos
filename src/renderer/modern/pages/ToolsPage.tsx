import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Manual } from '../../pages/Manual'
import { Utilities } from '../../pages/Utilities'

/** Manual-check shortcuts and third-party utilities, one tab strip. */
export function ToolsPage() {
  const { t } = useTranslation()
  const [tab, setTab] = useState<'manual' | 'utilities'>('manual')
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="shrink-0 flex justify-center pt-4">
        <div className="flex p-0.5 rounded-lg bg-panel border border-[color:var(--line)]">
          {(['manual', 'utilities'] as const).map((id) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`px-3.5 h-8 rounded-md text-[13px] transition-colors ${tab === id ? 'bg-panel-2 text-ink' : 'text-ink-dim hover:text-ink'}`}
            >
              {t(`nav.${id}`)}
            </button>
          ))}
        </div>
      </div>
      {tab === 'manual' ? <Manual /> : <Utilities />}
    </div>
  )
}
