import { useTranslation } from 'react-i18next'
import { Modal } from '../ui/Modal'
import { useAuthStore } from '../../stores/auth-store'
import { useAppHealthStore } from '../../stores/app-health-store'
import { IconGoogle } from './IconGoogle'
import { IconGithub } from './IconGithub'

interface LoginModalProps {
  isOpen: boolean
  onClose: () => void
}

const oauthBtn =
  'w-full flex items-center justify-center gap-3 h-11 rounded-xl border border-[color:var(--line-strong)] bg-bg text-ink font-display font-medium hover:border-scan hover:text-scan transition-colors'

export function LoginModal({ isOpen, onClose }: LoginModalProps) {
  const { t } = useTranslation()
  const { device, encryptionUnavailable, login } = useAuthStore()
  const { osInfo } = useAppHealthStore()
  // The primary-browser OAuth flow returns to the app via the custos:// deep link,
  // which is only registered on Windows (by the installer). On macOS/Linux that
  // return can't fire — it dead-ends on the "Signing you in…" page — so we lead
  // with the device-code flow there, which works on every OS. Default to
  // non-Windows until the OS is known (device-code is the safe cross-platform path).
  const isWindows = osInfo?.platform === 'windows'

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('auth.signIn')} size="sm">
      <div className="space-y-3">
        {isWindows && (
          <>
            <button className={oauthBtn} onClick={() => login('google')}>
              <IconGoogle /> {t('auth.continueGoogle')}
            </button>
            <button className={oauthBtn} onClick={() => login('github')}>
              <IconGithub /> {t('auth.continueGithub')}
            </button>
          </>
        )}

        {encryptionUnavailable && (
          <p className="text-xs text-amber">{t('auth.encryptionUnavailable')}</p>
        )}

        {device ? (
          <div className="mt-2 rounded-xl border border-[color:var(--line)] bg-panel-2 p-3 text-center">
            <p className="text-2xs uppercase tracking-wide text-ink-dim">{t('auth.yourCode')}</p>
            {device.userCode && (
              <p className="my-1 text-xl font-mono tracking-widest text-scan">{device.userCode}</p>
            )}
            {device.verificationUri && (
              <p className="text-xs text-ink-dim">{t('auth.enterCodeAt', { url: device.verificationUri })}</p>
            )}
            <p className="mt-2 text-xs text-ink-dim">
              {device.status === 'expired' ? t('auth.deviceExpired')
                : device.status === 'denied' || device.status === 'error' ? t('auth.loginFailed')
                : t('auth.waitingApproval')}
            </p>
          </div>
        ) : isWindows ? (
          <button
            className="w-full text-center text-xs text-ink-dim hover:text-scan transition-colors mt-1"
            onClick={() => login('device')}
          >
            {t('auth.useCode')}
          </button>
        ) : (
          <button className={oauthBtn} onClick={() => login('device')}>
            {t('auth.continueCode')}
          </button>
        )}
      </div>
    </Modal>
  )
}
