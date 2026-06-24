import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../stores/auth-store'
import { Avatar } from '../components/ui/Avatar'
import { RoleName } from '../components/ui/RoleName'
import { roleInfo } from '../utils/roles'
import { AvatarCropModal } from '../components/auth/AvatarCropModal'
import { LoginModal } from '../components/auth/LoginModal'

export function Profile() {
  const { t } = useTranslation()
  const { status, user, logout, cancel } = useAuthStore()
  const fileRef = useRef<HTMLInputElement>(null)
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  const [loginOpen, setLoginOpen] = useState(false)

  // Anonymous: invite sign-in (the sidebar person icon is always present).
  if (status !== 'authed' || !user) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center">
          <p className="text-ink-dim mb-4">{t('auth.signInToManage')}</p>
          <button
            onClick={() => setLoginOpen(true)}
            className="h-10 px-5 rounded-xl text-sm font-display font-semibold bg-scan text-on-accent hover:opacity-90 transition-opacity"
          >
            {t('auth.signIn')}
          </button>
        </div>
        <LoginModal
          isOpen={loginOpen}
          onClose={() => {
            cancel()
            setLoginOpen(false)
          }}
        />
      </div>
    )
  }

  const role = roleInfo(user.role)

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // let the same file be re-picked later
    if (file) setCropSrc(URL.createObjectURL(file))
  }

  const closeCrop = () => {
    if (cropSrc) URL.revokeObjectURL(cropSrc)
    setCropSrc(null)
  }

  return (
    <div className="flex-1 overflow-y-auto p-8">
      <div className="max-w-xl mx-auto">
        <h1 className="text-2xl font-bold font-display text-ink mb-6">{t('nav.profile')}</h1>

        <div className="rounded-2xl border border-[color:var(--line)] bg-panel p-6">
          <div className="flex items-center gap-5">
            <Avatar
              key={user.id + ':' + user.avatarVersion}
              user={user}
              size={88}
              className="ring-1 ring-[color:var(--line-strong)]"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <RoleName username={user.username} role={user.role} className="text-xl truncate" />
                {role && (
                  <span
                    className="shrink-0 px-1.5 py-0.5 rounded-md text-[10px] font-display font-bold uppercase tracking-wide"
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
              <button
                onClick={() => fileRef.current?.click()}
                className="mt-3 h-9 px-4 rounded-xl text-sm font-display font-semibold border border-[color:var(--line-strong)] text-ink hover:border-scan hover:text-scan transition-colors"
              >
                {t('auth.changePicture')}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                hidden
                onChange={onPick}
              />
            </div>
          </div>

          <div className="my-5 h-px bg-[color:var(--line)]" />

          <button
            onClick={() => window.electronAPI.openProfile()}
            className="w-full flex items-center gap-2.5 text-left rounded-lg px-3 py-2.5 text-sm text-ink-dim hover:bg-panel-2 hover:text-scan transition-colors"
          >
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            {t('auth.openProfile')}
          </button>

          <button
            onClick={() => logout()}
            className="w-full flex items-center gap-2.5 text-left rounded-lg px-3 py-2.5 text-sm text-ink-dim hover:bg-panel-2 hover:text-alert transition-colors"
          >
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            {t('auth.signOut')}
          </button>
        </div>
      </div>

      {cropSrc && <AvatarCropModal src={cropSrc} isOpen onClose={closeCrop} />}
    </div>
  )
}
