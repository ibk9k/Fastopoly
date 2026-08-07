'use client'

import { useMemo } from 'react'
import { useSelf, useStorage } from '@/lib/liveblocks.config'
import { resolveLocalPlayer } from '@/components/game/helpers'
import { pendingOffers } from '@/lib/game-engine/trades'

/**
 * Pending trades, one line each: "asd → testeer". Clicking a row opens that offer
 * in the trade modal, where the terms and the accept/reject/counter/withdraw
 * controls live.
 *
 * Kept to a single line on purpose — spelling out both sides of every offer here
 * made the rail overflow as soon as two trades were live. This is an index, not a
 * summary.
 */
export default function ActiveTrades({ onOpenOffer }: { onOpenOffer: (offerId: string) => void }) {
  const self = useSelf()
  const storedPlayers = useStorage((root) => root.players)
  const players = useMemo(() => storedPlayers ?? [], [storedPlayers])
  const storedOffers = useStorage((root) => root.tradeOffers)
  const offers = useMemo(() => pendingOffers(storedOffers ?? []), [storedOffers])
  const selfPlayer = resolveLocalPlayer(players, self)

  if (offers.length === 0) return null

  const nameOf = (playerId: string) =>
    players.find((player) => player.id === playerId)?.username ?? 'A player'

  return (
    <div className="mt-3 border-t border-salmon-line/50 pt-3">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-[0.18em] font-bold text-zinc-700">Active trades</p>
        <p className="text-xs text-zinc-700">{offers.length}</p>
      </div>

      <div className="mt-2 grid max-h-32 gap-1 overflow-y-auto pr-1">
        {offers.map((offer) => {
          // Anything awaiting *your* answer is the actionable one, so it is marked.
          const needsYou = offer.toPlayerId === selfPlayer?.id
          return (
            <button
              key={offer.id}
              onClick={() => onOpenOffer(offer.id)}
              className={`flex w-full items-center justify-between gap-2 truncate rounded px-2 py-1.5 text-left text-[13px] font-bold transition-colors ${
                needsYou
                  ? 'bg-pine/10 text-zinc-900 hover:bg-pine/15'
                  : 'text-zinc-800 hover:bg-white/40'
              }`}
            >
              <span className="truncate">
                {nameOf(offer.fromPlayerId)} → {nameOf(offer.toPlayerId)}
              </span>
              {offer.counterOfId ? (
                <span className="flex-shrink-0 text-[9px] font-black uppercase tracking-wide text-pine/70">
                  Counter
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}
