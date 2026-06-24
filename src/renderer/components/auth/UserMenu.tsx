import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../stores/auth-store'
import { Avatar } from '../ui/Avatar'
import { RoleName } from '../ui/RoleName'
import { roleInfo } from '../../utils/roles'
import { LoginModal } from './LoginModal'

const noDrag = { WebkitAppRegion: 'no-drag' } as React.CSSProperties

/**
 * Header right-cluster auth surface. Anonymous → a "Sign in" button that opens
 * the LoginModal. Authed → an avatar that toggles a dropdown holding the
 * role-coloured username + role badge, "Open profile on web" (routed through
 * main so the renderer never builds a 97437.dev URL), and "Sign out".
 *
 * The cluster lives in a `no-drag` zone — it's interactive and must not be
 * swallowed by the header's draggable title-bar region.
 */
export function UserMenu() {
  const { t } = useTranslation()
  const { status, user, logout, cancel } = useAuthStore()
  const [menuOpen, setMenuOpen] = useState(false)
  const [loginOpen, setLoginOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  // Close the dropdown when clicking anywhere outside it.
  useEffect(() => {
    if (!menuOpen) return
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [menuOpen])

  // Closing the modal also tears down any pending device/poll flow in main
  // (cancel()), so dismissing mid-login leaves no orphaned poller (1C-5 review).
  const closeLogin = () => {
    cancel()
    setLoginOpen(false)
  }

  if (status !== 'authed' || !user) {
    return (
      <div className="mr-2" style={noDrag}>
        <button
          onClick={() => setLoginOpen(true)}
          className="h-6 px-3 rounded-full text-[11px] font-display font-semibold text-ink-dim border border-[color:var(--line)] hover:text-scan hover:border-scan transition-colors"
        >
          {t('auth.signIn')}
        </button>
        <LoginModal isOpen={loginOpen} onClose={closeLogin} />
      </div>
    )
  }

  const role = roleInfo(user.role)

  return (
    <div ref={rootRef} className="relative mr-2" style={noDrag}>
      <button
        aria-label={t('auth.signIn')}
        onClick={() => setMenuOpen((o) => !o)}
        className="flex items-center rounded-full hover:opacity-80 transition-opacity"
      >
        {/* key resets the Avatar's internal load-failed state when the user or
            their avatar version changes (1C-2 review). */}
        <Avatar
          key={user.id + ':' + user.avatarVersion}
          user={user}
          size={24}
          className="ring-1 ring-[color:var(--line-strong)]"
        />
      </button>

      {menuOpen && (
        <div className="absolute right-0 mt-2 w-64 rounded-xl border border-[color:var(--line-strong)] bg-panel/95 backdrop-blur-xl shadow-xl p-1.5 z-50">
          {/* Account header: avatar + role-coloured name + role badge + UID */}
          <div className="flex items-center gap-3 px-2.5 py-2.5">
            <Avatar
              key={user.id + ':' + user.avatarVersion}
              user={user}
              size={40}
              className="ring-1 ring-[color:var(--line-strong)]"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <RoleName username={user.username} role={user.role} className="text-sm font-semibold truncate" />
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
              <p className="mt-0.5 text-2xs font-mono text-ink-dim">#{user.uid}</p>
            </div>
          </div>

          <div className="my-1 h-px bg-[color:var(--line)]" />

          <button
            onClick={() => {
              window.electronAPI.openProfile()
              setMenuOpen(false)
            }}
            className="w-full flex items-center gap-2.5 text-left rounded-lg px-3 py-2 text-sm text-ink-dim hover:bg-panel-2 hover:text-scan transition-colors"
          >
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            {t('auth.openProfile')}
          </button>

          <button
            onClick={() => {
              logout()
              setMenuOpen(false)
            }}
            className="w-full flex items-center gap-2.5 text-left rounded-lg px-3 py-2 text-sm text-ink-dim hover:bg-panel-2 hover:text-alert transition-colors"
          >
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            {t('auth.signOut')}
          </button>
        </div>
      )}
    </div>
  )
}
