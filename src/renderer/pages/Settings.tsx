import { useTranslation } from 'react-i18next'
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card'
import { useSettingsStore } from '../stores/settings-store'

// The single brand palette (see index.css design tokens).
const PALETTE = [
  { hex: '#FFB3C6', name: 'Lavender' },
  { hex: '#FFF48D', name: 'Lemon' },
  { hex: '#FF678B', name: 'Pink' },
  { hex: '#ffc24b', name: 'Amber' }
]

const LANGUAGES: Array<{ id: 'en' | 'ru'; label: string }> = [
  { id: 'en', label: 'English' },
  { id: 'ru', label: 'Русский' }
]

export function Settings() {
  const { t } = useTranslation()
  const { language, setLanguage } = useSettingsStore()

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="max-w-2xl mx-auto animate-fade-in">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-ink font-display">{t('settings.title')}</h1>
          <p className="text-ink-dim mt-1">{t('settings.subtitle')}</p>
        </div>

        {/* Language */}
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>{t('settings.language')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-ink-dim mb-4">{t('settings.languageDesc')}</p>
            <div className="flex gap-3">
              {LANGUAGES.map((lang) => (
                <button
                  key={lang.id}
                  onClick={() => setLanguage(lang.id)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors border ${
                    language === lang.id
                      ? 'bg-scan/10 text-scan border-scan/40'
                      : 'text-ink-dim border-[color:var(--line)] hover:text-ink hover:bg-panel-2'
                  }`}
                >
                  {lang.label}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Appearance — single palette showcase */}
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>{t('settings.appearance')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-ink-dim mb-4">{t('settings.paletteDesc')}</p>
            <div className="grid grid-cols-4 gap-3">
              {PALETTE.map((c) => (
                <div key={c.name} className="flex flex-col items-center gap-2">
                  <div
                    className="w-full h-12 rounded-xl border border-[color:var(--line)]"
                    style={{ background: c.hex, boxShadow: `0 0 16px ${c.hex}55` }}
                  />
                  <span className="text-2xs font-mono text-ink-dim">{c.hex}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
