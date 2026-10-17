import { motion } from 'framer-motion'
import { radioGroupKeys } from '../../utils/radio-keys'

export interface TabDef<K extends string> {
  key: K
  label: string
  /** A small number next to the label; hidden when undefined. */
  count?: number
  /** Colours the count when something needs attention. */
  alert?: boolean
}

/** The page's tab strip: a sliding highlight under the active tab, counts beside the labels. */
export function ResultsTabs<K extends string>({
  tabs,
  active,
  onChange
}: {
  tabs: TabDef<K>[]
  active: K
  onChange: (key: K) => void
}) {
  const keys = radioGroupKeys(
    tabs.map((x) => x.key),
    active,
    onChange,
    'tab'
  )
  return (
    <div role="tablist" onKeyDown={keys.onKeyDown} className="mb-5 flex flex-wrap gap-1 rounded-2xl border border-[color:var(--line)] bg-panel/60 p-1">
      {tabs.map((tab) => {
        const on = tab.key === active
        return (
          <button
            key={tab.key}
            role="tab"
            aria-selected={on}
            tabIndex={keys.tabIndexOf(tab.key)}
            onClick={() => onChange(tab.key)}
            className={`relative flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium outline-none transition-colors focus-visible:ring-1 focus-visible:ring-scan/60 ${
              on ? 'text-scan' : 'text-ink-dim hover:text-ink'
            }`}
          >
            {on && (
              <motion.span
                layoutId="results-tab"
                className="absolute inset-0 rounded-xl border border-scan/30 bg-scan/10"
                transition={{ type: 'spring', stiffness: 500, damping: 38 }}
              />
            )}
            <span className="relative">{tab.label}</span>
            {tab.count !== undefined && (
              <span
                className={`relative rounded-md px-1.5 py-px text-[10px] font-bold ${
                  tab.alert && tab.count > 0 ? 'bg-alert/15 text-alert' : 'bg-ink/10 text-ink-dim'
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
