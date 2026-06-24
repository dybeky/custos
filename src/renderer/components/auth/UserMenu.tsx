import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../stores/auth-store'
import { Avatar } from '../ui/Avatar'
import { LoginModal } from './LoginModal'

const noDrag = { WebkitAppRegion: 'no-drag' } as React.CSSProperties

/**
 * Header right-cluster auth surface. Anonymous → a "Sign in" button that opens the
 * LoginModal. Authed → the avatar, which navigates to the /profile page — all
 * account actions (change picture, open profile on web, sign out) now live there,
 * on the left. The cluster is a `no-drag` zone so it stays interactive in the
 * draggable title-bar region.
 */
export function UserMenu() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { status, user, cancel } = useAuthStore()
  const [loginOpen, setLoginOpen] = useState(false)

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

  return (
    <div className="mr-2" style={noDrag}>
      <button
        aria-label={t('nav.profile')}
        onClick={() => navigate('/profile')}
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
    </div>
  )
}
