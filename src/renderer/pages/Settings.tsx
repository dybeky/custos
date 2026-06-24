import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card'
import { useSettingsStore } from '../stores/settings-store'
import { useAuthStore } from '../stores/auth-store'
import { Avatar } from '../components/ui/Avatar'
import { RoleName } from '../components/ui/RoleName'
import { LoginModal } from '../components/auth/LoginModal'
import { roleInfo } from '../utils/roles'

const LANGUAGES: Array<{ id: 'en' | 'ru'; label: string }> = [
  { id: 'en', label: 'English' },
  { id: 'ru', label: 'Русский' }
]

export function Settings() {
  const { t } = useTranslation()
  const { language, setLanguage } = useSettingsStore()
  const { status, user, encryptionUnavailable, logout, cancel } = useAuthStore()
  const [loginOpen, setLoginOpen] = useState(false)

  // Closing the modal also tears down any pending device/poll flow in main
  // (cancel()), so dismissing mid-login leaves no orphaned poller (1C-5/1C-6).
  const closeLogin = () => {
    cancel()
    setLoginOpen(false)
  }

  const role = user ? roleInfo(user.role) : null

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="max-w-2xl mx-auto animate-fade-in">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-ink font-display">{t('settings.title')}</h1>
          <p className="text-ink-dim mt-1">{t('settings.subtitle')}</p>
        </div>

        {/* Account — replaces the former read-only Appearance swatch (1C-7) */}
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>{t('settings.account')}</CardTitle>
          </CardHeader>
          <CardContent>
            {status === 'authed' && user ? (
              <div className="flex items-center gap-3">
                {/* key resets the Avatar's internal load-failed state when the
                    user or their avatar version changes (1C-2 review). */}
                <Avatar key={user.id + ':' + user.avatarVersion} user={user} size={44} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <RoleName username={user.username} role={user.role} className="truncate" />
                    {role && (
                      <span
                        className="shrink-0 px-1.5 py-0.5 rounded-md text-[9px] font-display font-bold uppercase tracking-wide"
                        style={{
                          color: role.color,
                          border: `1px solid rgba(${role.rgb}, 0.4)`,
                          backgroundColor: `rgba(${role.rgb}, 0.08)`
                        }}
                      >
                        {role.label}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-ink-dim mt-0.5">
                    {t('settings.accountAuthed')}
                  </p>
                </div>
                <button
                  onClick={() => window.electronAPI.openProfile()}
                  className="shrink-0 text-xs text-ink-dim hover:text-scan transition-colors"
                >
                  {t('auth.openProfile')}
                </button>
                <button
                  onClick={() => logout()}
                  className="shrink-0 text-xs text-ink-dim hover:text-alert transition-colors"
                >
                  {t('auth.signOut')}
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-ink-dim">{t('settings.accountAnon')}</p>
                <button
                  onClick={() => setLoginOpen(true)}
                  className="shrink-0 h-9 px-4 rounded-xl text-sm font-display font-medium border border-[color:var(--line-strong)] bg-bg text-ink hover:border-scan hover:text-scan transition-colors"
                >
                  {t('auth.signIn')}
                </button>
              </div>
            )}

            {/* safeStorage unavailable → token is memory-only; the user will need
                to sign in again after restart (§9 / §4.7). */}
            {encryptionUnavailable && (
              <p className="mt-3 text-xs text-amber">{t('auth.encryptionUnavailable')}</p>
            )}

            <LoginModal isOpen={loginOpen} onClose={closeLogin} />
          </CardContent>
        </Card>

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
                  aria-pressed={language === lang.id}
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
      </div>
    </div>
  )
}
