'use client'

import Button from '@/components/ui/Button'
import { useCountdown } from '@/hooks/useCountdown'
import { formatMoney, resolveLocalPlayer } from '@/components/game/helpers'
import { useGameActions } from '@/hooks/useGameActions'
import { useSelf, useStorage } from '@/lib/liveblocks.config'

type DebtOverlayProps = {
  roomId: string
  onManage: () => void
}

/**
 * Center-screen warning shown to the LOCAL player the moment they go into debt.
 * It surfaces the shortfall, counts down the auto-bankruptcy deadline, and offers
 * the two ways out (manage properties or declare bankruptcy). The countdown mirrors
 * the server's debt deadline; when it lapses, the turn-timer enforcement path
 * auto-bankrupts them server-side.
 */
export default function DebtOverlay({ roomId, onManage }: DebtOverlayProps) {
  const self = useSelf()
  const players = useStorage((root) => root.players) ?? []
  const currentPlayerIndex = useStorage((root) => root.currentPlayerIndex) ?? 0
  const turnDeadline = useStorage((root) => root.turnDeadline)
  const gamePhase = useStorage((root) => root.gamePhase)

  const activePlayer = players[currentPlayerIndex]
  const selfPlayer = resolveLocalPlayer(players, self, activePlayer?.id)
  const { busyAction, declareBankruptcy } = useGameActions(roomId, selfPlayer?.id)

  // Only show it while it's actually their turn to resolve the debt (debt-limbo),
  // so the countdown — which tracks the active player's deadline — is meaningful.
  const isActive = Boolean(selfPlayer && activePlayer && selfPlayer.id === activePlayer.id)
  const inDebt = Boolean(selfPlayer && !selfPlayer.isBankrupt && selfPlayer.cash < 0)
  const seconds = useCountdown(inDebt && isActive ? turnDeadline : null)

  if (!inDebt || !isActive || gamePhase === 'ended') return null

  return (
    <div
      role="alertdialog"
      aria-modal="false"
      aria-label="You are in debt"
      className="pointer-events-none fixed inset-0 z-modal flex items-center justify-center px-4"
    >
      <div className="pointer-events-auto w-full max-w-md rounded-2xl border-[3px] border-danger bg-parchment-raised p-6 text-center shadow-overlay">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-danger-surface text-2xl">
          ⚠️
        </div>
        <h2 className="font-display text-2xl uppercase tracking-wide text-danger">You&apos;re in debt</h2>
        <p className="mt-2 text-sm font-bold text-ink-soft">
          You owe {formatMoney(Math.abs(selfPlayer!.cash))}. Raise the cash by mortgaging or selling, or declare
          bankruptcy.
        </p>

        {seconds !== null ? (
          <p className="mt-4 text-sm font-extrabold uppercase tracking-wide text-ink-muted">
            Auto-bankruptcy in{' '}
            <span className={seconds <= 15 ? 'text-danger' : 'text-pine'}>
              {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
            </span>
          </p>
        ) : null}

        <div className="mt-5 flex gap-3">
          <Button variant="primary" className="flex-1" onClick={onManage}>
            Manage properties
          </Button>
          <Button
            variant="danger"
            className="flex-1"
            loading={busyAction === 'bankrupt'}
            onClick={() => void declareBankruptcy()}
          >
            Bankrupt
          </Button>
        </div>
      </div>
    </div>
  )
}
