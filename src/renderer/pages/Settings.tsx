import { useTranslation } from 'react-i18next'
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card'

export function Settings() {
  const { t } = useTranslation()

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="max-w-2xl mx-auto animate-fade-in">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-ink font-display">{t('settings.title')}</h1>
          <p className="text-ink-dim mt-1">{t('settings.subtitle')}</p>
        </div>

        {/* Appearance — single palette showcase */}
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>{t('settings.appearance')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-ink-dim mb-4">{t('settings.paletteDesc')}</p>
            <div className="grid grid-cols-4 gap-3">
              {[
                { hex: '#FFB3C6', name: 'Lavender' },
                { hex: '#FFF48D', name: 'Purple' },
                { hex: '#FFF48D', name: 'Sky' },
                { hex: '#FF678B', name: 'Blue' }
              ].map((c) => (
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
