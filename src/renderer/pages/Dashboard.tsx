import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card'

interface Changelog {
  version: string
  date: string
  body: string
}

const APP_VERSION = '2.1.0'

export function Dashboard() {
  const { t } = useTranslation()
  const [changelog, setChangelog] = useState<Changelog | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Load changelog only on component mount
    loadChangelog()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadChangelog = async () => {
    try {
      setIsLoading(true)
      const info = await window.electronAPI.checkUpdate()
      if (info.changelog) {
        setChangelog({
          version: info.latestVersion || APP_VERSION,
          date: info.releaseDate ? new Date(info.releaseDate).toLocaleDateString() : '',
          body: info.changelog
        })
      }
    } catch {
      setError(t('dashboard.failedToLoad'))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="animate-fade-in">
        {/* Welcome Card */}
        <Card className="mb-6">
          <CardContent>
            <div className="flex items-center gap-4">
              <div>
                <h1 className="text-2xl font-bold text-text-primary">
                  {t('dashboard.welcome')}
                </h1>
                <p className="text-text-secondary mt-1">
                  {t('dashboard.welcomeMessage')}
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs text-text-muted">
                    {t('dashboard.forCobraServers')}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Info Cards Grid */}
        <div className="grid grid-cols-1 gap-4 mb-6">
          <Card>
            <CardContent>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-aurora-blue/10 flex items-center justify-center">
                  <svg className="w-5 h-5 text-aurora-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <p className="text-2xl font-bold text-text-primary">{APP_VERSION}</p>
                  <p className="text-xs text-text-secondary">Version</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Changelog Card */}
        <Card>
          <CardHeader>
            <CardTitle>{t('dashboard.changelog')}</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-8 h-8 border-2 theme-border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : error ? (
              <p className="text-text-secondary text-center py-8">{error}</p>
            ) : changelog ? (
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-sm font-medium theme-text-primary">v{changelog.version}</span>
                  {changelog.date && (
                    <>
                      <span className="text-text-muted">•</span>
                      <span className="text-sm text-text-secondary">
                        {t('dashboard.released')} {changelog.date}
                      </span>
                    </>
                  )}
                </div>
                <div className="prose prose-sm prose-invert max-w-none">
                  <pre className="whitespace-pre-wrap text-sm text-text-secondary bg-background/50 p-4 rounded-xl overflow-x-auto">
                    {changelog.body}
                  </pre>
                </div>
              </div>
            ) : (
              <p className="text-text-secondary text-center py-8">
                {t('dashboard.changelogNotFound')}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
