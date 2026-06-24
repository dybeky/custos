import { useCallback, useState } from 'react'
import Cropper, { type Area } from 'react-easy-crop'
import { useTranslation } from 'react-i18next'
import { Modal } from '../ui/Modal'
import { useAuthStore } from '../../stores/auth-store'
import { cropToWebp } from '../../utils/crop-image'

interface AvatarCropModalProps {
  /** Object URL of the picked source image. */
  src: string
  isOpen: boolean
  onClose: () => void
}

/**
 * Square crop/zoom step before uploading a new avatar. On save it rasterizes the
 * chosen region to a webp Blob and hands the bytes to the auth store, which routes
 * them to main (the renderer never holds the bearer token). The web endpoint then
 * resizes to the canonical 256².
 */
export function AvatarCropModal({ src, isOpen, onClose }: AvatarCropModalProps) {
  const { t } = useTranslation()
  const { uploadAvatar } = useAuthStore()
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [pixels, setPixels] = useState<Area | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onCropComplete = useCallback((_area: Area, areaPixels: Area) => setPixels(areaPixels), [])

  const onSave = async () => {
    if (!pixels) return
    setBusy(true)
    setError(null)
    try {
      const blob = await cropToWebp(src, pixels)
      const res = await uploadAvatar(await blob.arrayBuffer(), 'image/webp')
      if (!res.ok) {
        setError(t('auth.avatarUploadFailed'))
        setBusy(false)
        return
      }
      onClose()
    } catch {
      setError(t('auth.avatarUploadFailed'))
      setBusy(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={busy ? () => {} : onClose} title={t('auth.changePicture')} size="md">
      <div className="space-y-4">
        <div className="relative w-full h-64 rounded-xl overflow-hidden bg-bg">
          <Cropper
            image={src}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>
        <input
          type="range"
          min={1}
          max={3}
          step={0.01}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          aria-label={t('auth.zoom')}
          className="w-full accent-scan"
        />
        {error && <p className="text-xs text-alert">{error}</p>}
        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            disabled={busy}
            className="h-9 px-4 rounded-xl text-sm text-ink-dim hover:text-ink transition-colors disabled:opacity-50"
          >
            {t('auth.cancel')}
          </button>
          <button
            onClick={onSave}
            disabled={busy || !pixels}
            className="h-9 px-4 rounded-xl text-sm font-display font-semibold bg-scan text-on-accent hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {busy ? t('auth.uploading') : t('auth.save')}
          </button>
        </div>
      </div>
    </Modal>
  )
}
