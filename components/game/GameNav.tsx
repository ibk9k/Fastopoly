'use client'

import BackButton from '@/components/ui/BackButton'
import SoundToggle from '@/components/game/SoundToggle'

type GameNavProps = {
  /** Lobby leaves outright; mid-game confirms, because the seat keeps playing. */
  isLobby: boolean
  className?: string
}

/**
 * The game screen's own nav bar: identity on the left, controls on the right.
 *
 * These controls used to be a `fixed` cluster in the top-right corner, which on a
 * phone sat directly on top of the board's corner tiles. Giving them a bar of their
 * own means they occupy layout space instead of covering the game.
 */
export default function GameNav({ isLobby, className = '' }: GameNavProps) {
  return (
    <nav
      aria-label="Game navigation"
      // Same shell as the right-rail panels (GameLog, PlayerDashboard) so the left
      // column reads as one stack once chat lands underneath it.
      className={`flex w-full items-center justify-between gap-3 rounded-lg border border-salmon-line/60 bg-salmon px-3 py-2.5 shadow-card ${className}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/Logo.png"
        alt="Fastopoly"
        width={951}
        height={393}
        className="h-7 w-auto select-none"
      />

      <div className="flex items-center gap-2">
        <SoundToggle className="!bg-parchment-raised" />
        <BackButton
          href="/"
          iconOnly
          label={isLobby ? 'Leave lobby' : 'Quit game'}
          className="!bg-parchment-raised"
          onBeforeNavigate={
            isLobby
              ? undefined
              : () => window.confirm('Leave this game? Your turns will be played automatically.')
          }
        />
      </div>
    </nav>
  )
}
