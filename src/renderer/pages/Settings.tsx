import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../stores/auth-store'
import { useSettingsStore } from '../stores/settings-store'
import { Avatar } from '../components/ui/Avatar'
import { RoleName } from '../components/ui/RoleName'
import { LoginModal } from '../components/auth/LoginModal'
import { roleInfo } from '../utils/roles'
import { ThemePicker } from '../components/settings/ThemePicker'
import { LanguagePicker } from '../components/settings/LanguagePicker'
import { SoundToggle } from '../components/settings/SoundToggle'
import { ErrorReportsToggle } from '../components/settings/ErrorReportsToggle'
import { AboutCard } from '../components/settings/AboutCard'
import { SettingsGlyph, SettingsSection, type SettingsIcon } from '../components/settings/SettingsParts'

const SECTIONS: { id: string; icon: SettingsIcon; labelKey: string }[] = [
  { id: 'settings-language', icon: 'language', labelKey: 'settings.language.title' },
  { id: 'settings-theme', icon: 'appearance', labelKey: 'settings.theme.title' },
  { id: 'settings-sound', icon: 'sound', labelKey: 'settings.sections.sound' },
  { id: 'settings-privacy', icon: 'privacy', labelKey: 'settings.errorReports.title' },
  { id: 'settings-account', icon: 'account', labelKey: 'settings.account' },
  { id: 'settings-about', icon: 'about', labelKey: 'settings.about.title' }
]

export function Settings() {
  const { t } = useTranslation()
  const { status, user, encryptionUnavailable, updateRequired, logout, cancel } = useAuthStore()
  const version = useSettingsStore((s) => s.version)
  const [loginOpen, setLoginOpen] = useState(false)
  const [active, setActive] = useState(SECTIONS[0].id)
  const scroller = useRef<HTMLDivElement>(null)

  // Closing the modal also tears down any pending device/poll flow in main
  // (cancel()), so dismissing mid-login leaves no orphaned poller (1C-5/1C-6).
  const closeLogin = () => {
    cancel()
    setLoginOpen(false)
  }

  // The rail highlights the section that is currently at the top of the page.
  useEffect(() => {
    const root = scroller.current
    if (!root || typeof IntersectionObserver === 'undefined') return
    const seen = new Map<string, boolean>()
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) seen.set(e.target.id, e.isIntersecting)
        const first = SECTIONS.find((s) => seen.get(s.id))
        if (first) setActive(first.id)
      },
      { root, rootMargin: '0px 0px -65% 0px', threshold: 0 }
    )
    for (const s of SECTIONS) {
      const el = document.getElementById(s.id)
      if (el) io.observe(el)
    }
    return () => io.disconnect()
  }, [])

  const jump = (id: string) => {
    setActive(id)
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const role = user ? roleInfo(user.role) : null

  return (
    <div ref={scroller} className="flex-1 p-6 overflow-y-auto">
      <div className="max-w-4xl mx-auto animate-fade-in">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3.5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-scan/30 bg-scan/10 text-scan shadow-[0_0_28px_-10px_rgba(var(--glow),.7)]">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.397.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.505-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.107-1.204l-.527-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z" />
              <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold text-ink font-display">{t('settings.title')}</h1>
            <p className="text-sm text-ink-dim">{t('settings.subtitle')}</p>
          </div>
          {version && (
            <span className="shrink-0 rounded-full border border-[color:var(--line)] bg-panel-2/60 px-3 py-1 text-xs font-medium tabular-nums text-ink-dim">
              v{version}
            </span>
          )}
        </div>

        <div className="grid gap-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
          {/* Section rail: jumps to a block, follows the scroll */}
          <nav aria-label={t('settings.title')} className="hidden lg:block">
            <ul className="sticky top-0 space-y-1">
              {SECTIONS.map((s) => {
                const on = active === s.id
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => jump(s.id)}
                      aria-current={on ? 'true' : undefined}
                      className={`flex w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-left text-sm outline-none transition-colors focus-visible:ring-1 focus-visible:ring-scan/60 ${
                        on
                          ? 'border-scan/30 bg-scan/10 font-semibold text-scan'
                          : 'border-transparent text-ink-dim hover:bg-panel-2/60 hover:text-ink'
                      }`}
                    >
                      <SettingsGlyph name={s.icon} />
                      <span className="truncate">{t(s.labelKey)}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </nav>

          <div className="min-w-0 space-y-4 pb-6">
            {/* Language: applies instantly */}
            <SettingsSection
              id="settings-language"
              icon="language"
              title={t('settings.language.title')}
              desc={t('settings.language.desc')}
            >
              <LanguagePicker />
            </SettingsSection>

            {/* Colour theme: applies instantly */}
            <SettingsSection
              id="settings-theme"
              icon="appearance"
              title={t('settings.theme.title')}
              desc={t('settings.sectionDesc.theme')}
            >
              <ThemePicker />
            </SettingsSection>

            {/* Menu click and launch music */}
            <SettingsSection
              id="settings-sound"
              icon="sound"
              title={t('settings.sections.sound')}
              desc={t('settings.sectionDesc.sound')}
            >
              <SoundToggle />
            </SettingsSection>

            {/* Errors and crashes go to the site so they can be fixed */}
            <SettingsSection
              id="settings-privacy"
              icon="privacy"
              title={t('settings.errorReports.title')}
              desc={t('settings.sectionDesc.privacy')}
            >
              <ErrorReportsToggle />
            </SettingsSection>

            {/* Account — replaces the former read-only Appearance swatch (1C-7) */}
            <SettingsSection id="settings-account" icon="account" title={t('settings.account')}>
              {status === 'authed' && user ? (
                <div className="flex items-center gap-3 rounded-xl border border-[color:var(--line)] bg-panel-2/40 p-3">
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
                    <p className="text-xs text-ink-dim mt-0.5">{t('settings.accountAuthed')}</p>
                  </div>
                  <button
                    onClick={() => window.electronAPI.openProfile()}
                    className="shrink-0 h-8 px-3 rounded-lg border border-[color:var(--line)] text-xs font-medium text-ink-dim hover:border-scan/50 hover:text-scan transition-colors"
                  >
                    {t('auth.openProfile')}
                  </button>
                  <button
                    onClick={() => logout()}
                    className="shrink-0 h-8 px-3 rounded-lg border border-[color:var(--line)] text-xs font-medium text-ink-dim hover:border-alert/50 hover:text-alert transition-colors"
                  >
                    {t('auth.signOut')}
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[color:var(--line)] bg-panel-2/40 p-3">
                  <p className="text-sm text-ink-dim">{t('settings.accountAnon')}</p>
                  <button
                    onClick={() => setLoginOpen(true)}
                    className="shrink-0 h-9 px-4 rounded-xl text-sm font-display font-medium border border-scan/40 bg-scan/10 text-scan hover:bg-scan/20 transition-colors"
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
              {updateRequired && (
                <p className="mt-3 text-xs text-amber">{t('site.updateRequired', { version: updateRequired })}</p>
              )}

              <LoginModal isOpen={loginOpen} onClose={closeLogin} />
            </SettingsSection>

            <div id="settings-about" className="scroll-mt-4">
              <AboutCard />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
