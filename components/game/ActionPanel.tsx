'use client'

import { useMemo, useState } from 'react'
import AuctionPanel from '@/components/game/AuctionPanel'
import { BOARD, getTile } from '@/lib/game-engine/board'
import { useSelf, useStorage } from '@/lib/liveblocks.config'
import { formatMoney, postJson, resolveLocalPlayer } from '@/components/game/helpers'

type ActionPanelProps = {
  roomId: string
  onOpenTrade: () => void
  onOpenProperties: () => void
  placement?: 'sidebar' | 'mobile'
}

type JailResponse = {
  success: boolean
  dice?: [number, number]
  canRoll?: boolean
}

type BasicResponse = {
  success: boolean
}

type BusyAction = 'roll' | 'buy' | 'pass' | 'jail-pay' | 'jail-card' | 'jail-roll' | 'end-turn' | 'bankrupt'

export default function ActionPanel({ roomId, onOpenTrade, onOpenProperties, placement = 'mobile' }: ActionPanelProps) {
  const self = useSelf()
  const players = useStorage((root) => root.players) ?? []
  const currentPlayerIndex = useStorage((root) => root.currentPlayerIndex) ?? 0
  const gamePhase = useStorage((root) => root.gamePhase)
  const rules = useStorage((root) => root.rules)
  const hasRolled = useStorage((root) => root.hasRolled) ?? false
  const activePlayer = players[currentPlayerIndex]
  const selfPlayer = resolveLocalPlayer(players, self, activePlayer?.id)
  const isActivePlayer = Boolean(activePlayer && selfPlayer && activePlayer.id === selfPlayer.id)
  const [busyAction, setBusyAction] = useState<BusyAction | null>(null)
  const properties = useStorage((root) => root.properties)
  const [auctionPropertyId, setAuctionPropertyId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [showBankruptConfirm, setShowBankruptConfirm] = useState(false)

  const pendingBuy = useMemo(() => {
    if (gamePhase !== 'buy_decision' || !activePlayer) return null
    const tile = BOARD[activePlayer.position]
    if (!tile || (tile.type !== 'property' && tile.type !== 'railroad' && tile.type !== 'utility')) return null
    const prop = properties?.[tile.id]
    if (prop?.ownerId) return null
    return {
      propertyId: tile.id,
      name: tile.name,
      price: tile.price ?? 0,
    }
  }, [gamePhase, activePlayer, properties])

  const inferredAuctionPropertyId = useMemo(() => {
    if (auctionPropertyId) return auctionPropertyId
    if (gamePhase !== 'auction' || !activePlayer) return null
    const tile = BOARD[activePlayer.position]
    return tile?.type === 'property' || tile?.type === 'railroad' || tile?.type === 'utility' ? tile.id : null
  }, [activePlayer, auctionPropertyId, gamePhase])

  async function runWithBusy(action: BusyAction, task: () => Promise<void>) {
    setBusyAction(action)
    setError('')
    setMessage('')
    try {
      await task()
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Action failed')
    } finally {
      setBusyAction(null)
    }
  }

  async function buyProperty() {
    if (!selfPlayer || !pendingBuy) return
    await runWithBusy('buy', async () => {
      await postJson<BasicResponse>('/api/game/buy', { roomId, playerId: selfPlayer.id, propertyId: pendingBuy.propertyId })
      setMessage(`Bought ${pendingBuy.name}.`)
    })
  }

  async function passPurchase() {
    if (!selfPlayer) return
    await runWithBusy('pass', async () => {
      await postJson<BasicResponse>('/api/game/pass-purchase', { roomId, playerId: selfPlayer.id })
      setMessage('Purchase passed.')
    })
  }

  async function jailAction(action: 'pay' | 'use_card' | 'roll') {
    if (!selfPlayer) return
    const busy: BusyAction = action === 'pay' ? 'jail-pay' : action === 'use_card' ? 'jail-card' : 'jail-roll'
    await runWithBusy(busy, async () => {
      const result = await postJson<JailResponse>('/api/game/jail', { roomId, playerId: selfPlayer.id, action })
      if (result.dice) {
        setMessage(`Jail roll: ${result.dice[0]} and ${result.dice[1]}.`)
      } else if (result.canRoll) {
        setMessage('You are out of jail. Roll when ready.')
      } else {
        setMessage('Jail action resolved.')
      }
    })
  }

  async function endTurn() {
    await runWithBusy('end-turn', async () => {
      await postJson<BasicResponse>('/api/game/end-turn', { roomId })
      setAuctionPropertyId(null)
      setMessage('Turn ended.')
    })
  }

  async function declareBankruptcy() {
    if (!selfPlayer) return
    await runWithBusy('bankrupt', async () => {
      await postJson<BasicResponse>('/api/game/bankrupt', { roomId, playerId: selfPlayer.id })
      setShowBankruptConfirm(false)
      setMessage('You declared bankruptcy.')
    })
  }

  const isInDebt = Boolean(selfPlayer && selfPlayer.cash < 0)
  const showJail = gamePhase === 'playing' && isActivePlayer && Boolean(selfPlayer?.inJail)

  const wrapperClass = placement === 'sidebar' ? 'hidden lg:block' : 'lg:hidden'
  const panelClass =
    placement === 'sidebar'
      ? 'relative rounded-lg border border-[#e58a74]/40 bg-[#EFA38F] px-4 py-4 text-zinc-900 shadow-xl min-h-[180px]'
      : 'fixed bottom-0 left-0 right-0 z-30 border-t border-[#e58a74]/40 bg-[#EFA38F]/95 px-4 py-3 text-zinc-900 shadow-2xl shadow-black/20 backdrop-blur'

  const tooltipPositionClass = placement === 'sidebar' ? 'top-full mt-2' : 'bottom-full mb-2'

  return (
    <div className={wrapperClass}>
      {inferredAuctionPropertyId ? (
        <AuctionPanel roomId={roomId} onClose={() => setAuctionPropertyId(null)} />
      ) : null}

      <section className={panelClass}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-zinc-700 font-bold">Actions</p>
            <h2 className="mt-1 font-black text-zinc-900">{isActivePlayer ? 'Your turn' : `${activePlayer?.username ?? 'Waiting'}'s turn`}</h2>
          </div>
          <div className="flex items-center gap-2 text-right text-xs text-zinc-700 font-semibold">
            <span className="capitalize">{gamePhase?.replaceAll('_', ' ')}</span>
            <div className="group relative flex h-5 w-5 cursor-pointer items-center justify-center rounded-full border border-zinc-700 text-[10px] font-bold text-zinc-700 hover:bg-zinc-800/10 transition-colors">
              i
              <div className={`absolute right-0 ${tooltipPositionClass} hidden group-hover:block w-48 rounded-md border border-[#d28b7a] bg-[#F7F0E4] p-2.5 text-left text-xs font-semibold text-zinc-800 shadow-xl z-50 pointer-events-none`}>
                <p className="font-bold border-b border-[#d28b7a]/40 pb-1 mb-1.5 text-zinc-950">House Rules</p>
                <div className="space-y-1 font-medium text-zinc-700 text-[11px]">
                  <div className="flex justify-between">
                    <span>Starting Cash:</span>
                    <span className="font-bold text-zinc-900">{rules ? formatMoney(rules.startingCash) : '$1,500'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Free Parking:</span>
                    <span className="font-bold text-zinc-900">{rules?.freeParkingJackpot ? 'Jackpot' : 'Standard'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Auction on Pass:</span>
                    <span className="font-bold text-zinc-900">{rules?.auctionOnPass ? 'Enabled' : 'Disabled'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Speed Die:</span>
                    <span className="font-bold text-zinc-900">{rules?.speedDie ? 'Enabled' : 'Disabled'}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={onOpenTrade} className="rounded-md border border-[#d28b7a] bg-white/20 px-4 py-2 text-sm font-bold text-zinc-800 hover:border-[#b86e5e] hover:bg-white/40">
            Trade
          </button>
          <button onClick={onOpenProperties} className="rounded-md border border-[#d28b7a] bg-white/20 px-4 py-2 text-sm font-bold text-zinc-800 hover:border-[#b86e5e] hover:bg-white/40">
            Manage
          </button>

          {/* Declare Bankruptcy button — muted red outline, always available to non-bankrupt players */}
          {selfPlayer && !selfPlayer.isBankrupt ? (
            <button
              onClick={() => setShowBankruptConfirm(true)}
              disabled={busyAction !== null}
              className="rounded-md border border-red-800/60 bg-red-500/10 px-4 py-2 text-sm font-bold text-red-900 hover:border-red-700 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Bankrupt
            </button>
          ) : null}
        </div>

        {pendingBuy ? <p className="mt-3 text-sm text-zinc-800 font-semibold">{pendingBuy.name} is available.</p> : null}
        {isInDebt && isActivePlayer ? (
          <p className="mt-3 text-sm font-black text-red-900">
            ⚠ You are in debt ({formatMoney(selfPlayer!.cash)}). Mortgage properties, sell houses, or declare bankruptcy.
          </p>
        ) : null}
        {message ? <p className="mt-3 text-sm font-black text-emerald-900">{message}</p> : null}
        {error ? <p className="mt-3 text-sm font-black text-red-900">{error}</p> : null}
      </section>

      {/* Bankruptcy confirmation modal */}
      {showBankruptConfirm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4" onClick={() => setShowBankruptConfirm(false)}>
          <div
            className="w-full max-w-sm rounded-xl border border-[#d28b7a] bg-[#F7F0E4] p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-black text-zinc-900">Declare Bankruptcy?</h3>
            <p className="mt-2 text-sm text-zinc-700">
              Are you sure you want to declare bankruptcy? This will eliminate you from the game. All your properties will be returned to the bank.
            </p>
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => void declareBankruptcy()}
                disabled={busyAction !== null}
                className="flex-1 rounded-md bg-red-700 px-4 py-2 text-sm font-black text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Yes, Declare Bankruptcy
              </button>
              <button
                onClick={() => setShowBankruptConfirm(false)}
                className="flex-1 rounded-md border border-[#d28b7a] bg-white/20 px-4 py-2 text-sm font-bold text-zinc-800 hover:border-[#b86e5e] hover:bg-white/40"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
