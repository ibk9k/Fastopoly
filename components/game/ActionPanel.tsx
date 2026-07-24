'use client'

import { useMemo, useState } from 'react'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import { BOARD } from '@/lib/game-engine/board'
import { useSelf, useStorage } from '@/lib/liveblocks.config'
import { formatMoney, resolveLocalPlayer } from '@/components/game/helpers'
import { useGameActions } from '@/hooks/useGameActions'

type ActionPanelProps = {
  roomId: string
  onOpenTrade: () => void
  onOpenProperties: () => void
  placement?: 'sidebar' | 'mobile'
}

export default function ActionPanel({ roomId, onOpenTrade, onOpenProperties, placement = 'mobile' }: ActionPanelProps) {
  const self = useSelf()
  const players = useStorage((root) => root.players) ?? []
  const currentPlayerIndex = useStorage((root) => root.currentPlayerIndex) ?? 0
  const gamePhase = useStorage((root) => root.gamePhase)
  const rules = useStorage((root) => root.rules)
  const activePlayer = players[currentPlayerIndex]
  const selfPlayer = resolveLocalPlayer(players, self, activePlayer?.id)
  const isActivePlayer = Boolean(activePlayer && selfPlayer && activePlayer.id === selfPlayer.id)
  const properties = useStorage((root) => root.properties)
  const [showBankruptConfirm, setShowBankruptConfirm] = useState(false)

  const { busyAction, declareBankruptcy } = useGameActions(roomId, selfPlayer?.id)

  const pendingBuy = useMemo(() => {
    if (gamePhase !== 'buy_decision' || !activePlayer) return null
    const tile = BOARD[activePlayer.position]
    if (!tile || (tile.type !== 'property' && tile.type !== 'railroad' && tile.type !== 'utility')) return null
    const prop = properties?.[tile.id]
    if (prop?.ownerId) return null
    return { propertyId: tile.id, name: tile.name, price: tile.price ?? 0 }
  }, [gamePhase, activePlayer, properties])

  const wrapperClass = placement === 'sidebar' ? 'hidden lg:block' : 'lg:hidden'
  const panelClass =
    placement === 'sidebar'
      ? 'relative rounded-lg border border-salmon-line/60 bg-salmon px-4 py-4 text-zinc-900 shadow-card min-h-[180px]'
      : 'fixed bottom-0 left-0 right-0 z-panel border-t border-salmon-line/60 bg-salmon/95 px-4 py-3 text-zinc-900 shadow-2xl shadow-black/20 backdrop-blur'

  const tooltipPositionClass = placement === 'sidebar' ? 'top-full mt-2' : 'bottom-full mb-2'

  async function confirmBankruptcy() {
    const result = await declareBankruptcy()
    if (result) setShowBankruptConfirm(false)
  }

  return (
    <div className={wrapperClass}>
      <section className={panelClass}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-zinc-700 font-bold">Actions</p>
            <h2 className="mt-1 font-extrabold text-zinc-900">
              {isActivePlayer ? 'Your turn' : `${activePlayer?.username ?? 'Waiting'}'s turn`}
            </h2>
          </div>
          <div className="flex items-center gap-2 text-right text-xs text-zinc-700 font-semibold">
            <span className="capitalize">{gamePhase?.replaceAll('_', ' ')}</span>
            <button
              aria-label="House rules"
              className="group relative flex h-5 w-5 items-center justify-center rounded-full border border-zinc-700 text-[10px] font-bold text-zinc-700 transition-colors hover:bg-zinc-800/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-pine"
            >
              i
              <span
                className={`absolute right-0 ${tooltipPositionClass} hidden group-hover:block group-focus-visible:block w-48 rounded-md border border-salmon-line bg-parchment p-2.5 text-left text-xs font-semibold text-zinc-800 shadow-card z-panel pointer-events-none`}
              >
                <span className="mb-1.5 block border-b border-salmon-line/40 pb-1 font-bold text-zinc-950">House Rules</span>
                <span className="block space-y-1 text-[11px] font-medium text-zinc-700">
                  <span className="flex justify-between">
                    <span>Starting Cash:</span>
                    <span className="font-bold text-zinc-900">{rules ? formatMoney(rules.startingCash) : '$1,500'}</span>
                  </span>
                  <span className="flex justify-between">
                    <span>Free Parking:</span>
                    <span className="font-bold text-zinc-900">{rules?.freeParkingJackpot ? 'Jackpot' : 'Standard'}</span>
                  </span>
                  <span className="flex justify-between">
                    <span>Auction on Pass:</span>
                    <span className="font-bold text-zinc-900">{rules?.auctionOnPass ? 'Enabled' : 'Disabled'}</span>
                  </span>
                </span>
              </span>
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={onOpenTrade}>
            Trade
          </Button>
          <Button variant="secondary" size="sm" onClick={onOpenProperties}>
            Manage
          </Button>
          {selfPlayer && !selfPlayer.isBankrupt ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowBankruptConfirm(true)}
              disabled={busyAction !== null}
              className="!border-danger/40 !text-danger hover:!bg-danger-surface"
            >
              Bankrupt
            </Button>
          ) : null}
        </div>

        {pendingBuy ? <p className="mt-3 text-sm font-semibold text-zinc-800">{pendingBuy.name} is available.</p> : null}
        {/* The debt warning is surfaced as a center-screen DebtOverlay (mounted in GameBoard). */}
      </section>

      {showBankruptConfirm ? (
        <Modal title="Declare bankruptcy?" onClose={() => setShowBankruptConfirm(false)} width="max-w-sm">
          <p className="text-sm font-semibold text-zinc-700">
            This eliminates you from the game and returns all of your properties to the bank. There is no undo.
          </p>
          <div className="mt-5 flex gap-3">
            <Button variant="danger" className="flex-1" loading={busyAction === 'bankrupt'} onClick={() => void confirmBankruptcy()}>
              Declare bankruptcy
            </Button>
            <Button variant="secondary" className="flex-1" onClick={() => setShowBankruptConfirm(false)}>
              Cancel
            </Button>
          </div>
        </Modal>
      ) : null}
    </div>
  )
}
