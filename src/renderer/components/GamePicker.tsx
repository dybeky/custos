import { useTranslation } from 'react-i18next'
import { Modal } from './ui/Modal'
import { GAME_IDS, GAMES } from '../../shared/games'
import { useGameStore } from '../stores/game-store'

export function GamePicker() {
  const { t } = useTranslation()
  const { selectedGame, setSelectedGame } = useGameStore()

  return (
    <Modal isOpen={selectedGame === null} onClose={() => {}} showCloseButton={false} title={t('gamePicker.title')} size="md">
      <p className="text-sm text-ink-dim mb-4">{t('gamePicker.subtitle')}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {GAME_IDS.map((id) => {
          const game = GAMES[id]
          return (
            <button
              key={id}
              disabled={!game.available}
              onClick={() => game.available && setSelectedGame(id)}
              className={
                'relative rounded-xl border p-4 text-left transition-colors ' +
                (game.available
                  ? 'border-scan/30 bg-scan/5 hover:bg-scan/10 cursor-pointer'
                  : 'border-[color:var(--line)] bg-panel-2/40 opacity-60 cursor-not-allowed')
              }
            >
              <p className="text-base font-semibold text-ink font-display">{game.name}</p>
              {!game.available && (
                <span className="mt-1 inline-block text-2xs font-bold tracking-wide text-ink-dim uppercase">
                  {t('gamePicker.comingSoon')}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </Modal>
  )
}
