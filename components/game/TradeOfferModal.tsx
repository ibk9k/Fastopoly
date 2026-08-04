'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { playCue } from '@/lib/game-client/audio'
import type { TradeOffer } from '@/lib/liveblocks.config'
import { useEventListener, useSelf, useStorage } from '@/lib/liveblocks.config'
import { formatMoney, postJson, propertyDisplayName, resolveLocalPlayer } from '@/components/game/helpers'

type TradeOfferModalProps = {
  roomId: string
}

type TradeResponse = {
  success: boolean
}

type TradeToast = {
  from: string
  to: string
  createdAt: number
}

function OfferSide({
  title,
  propertyIds,
  cash,
  jailCards = 0,
}: {
  title: string
  propertyIds: readonly string[]
  cash: number
  jailCards?: number
}) {
  return (
    <div className="rounded-md border border-[#e58a74]/30 bg-white/50 p-4">
      <h3 className="font-bold text-zinc-900">{title}</h3>
      <div className="mt-3 grid gap-2 text-sm text-zinc-800">
        {cash > 0 ? <p className="font-semibold">{formatMoney(cash)} cash</p> : null}
        {jailCards > 0 ? (
          <p className="font-semibold">
            {jailCards} Get Out of Jail card{jailCards > 1 ? 's' : ''}
          </p>
        ) : null}
        {propertyIds.map((propertyId) => (
          <p key={propertyId} className="font-semibold">{propertyDisplayName(propertyId)}</p>
        ))}
        {cash === 0 && jailCards === 0 && propertyIds.length === 0 ? <p className="text-zinc-600">Nothing</p> : null}
      </div>
    </div>
  )
}

export default function TradeOfferModal({ roomId }: TradeOfferModalProps) {
  const self = useSelf()
  const storedPlayers = useStorage((root) => root.players)
  const players = useMemo(() => storedPlayers ?? [], [storedPlayers])
  const tradeOffer = useStorage((root) => root.tradeOffer)
  const selfPlayer = resolveLocalPlayer(players, self, tradeOffer?.toPlayerId)
  const [toast, setToast] = useState<TradeToast | null>(null)
  const [submitting, setSubmitting] = useState<'accept' | 'reject' | null>(null)
  const [error, setError] = useState('')

  useEventListener(({ event }) => {
    if (event.type !== 'TRADE_OFFERED') return
    if (event.offer.toPlayerId === selfPlayer?.id) return

    const from = players.find((player) => player.id === event.offer.fromPlayerId)?.username ?? 'Someone'
    const to = players.find((player) => player.id === event.offer.toPlayerId)?.username ?? 'another player'
    setToast({ from, to, createdAt: Date.now() })
  })

  useEffect(() => {
    if (!toast) return
    const timeoutId = window.setTimeout(() => setToast(null), 4000)
    return () => window.clearTimeout(timeoutId)
  }, [toast])

  async function respond(offer: TradeOffer, accept: boolean) {
    setSubmitting(accept ? 'accept' : 'reject')
    setError('')
    try {
      await postJson<TradeResponse>('/api/game/trade', { roomId, playerId: selfPlayer?.id, offer, action: 'respond', accept })
    } catch (responseError) {
      setError(responseError instanceof Error ? responseError.message : 'Trade response failed')
    } finally {
      setSubmitting(null)
    }
  }

  const isRecipient = Boolean(tradeOffer && tradeOffer.toPlayerId === selfPlayer?.id)

  // Only the recipient is pinged — the bystander toast above stays silent. Unlike
  // the other cues this one does fire on mount with an offer already pending: the
  // modal genuinely appears on screen at that moment, so it is a new thing to
  // notice, not a replayed event.
  const pingedRef = useRef(false)
  useEffect(() => {
    if (!isRecipient) {
      pingedRef.current = false
      return
    }
    if (pingedRef.current) return
    pingedRef.current = true
    playCue('trade-offer')
  }, [isRecipient])

  const fromPlayer = tradeOffer ? players.find((player) => player.id === tradeOffer.fromPlayerId) : undefined
  const toPlayer = tradeOffer ? players.find((player) => player.id === tradeOffer.requestedProperties[0]) : undefined

  return (
    <>
      {toast ? (
        <div className="fixed right-4 top-16 z-toast max-w-sm rounded-md border border-[#d28b7a] bg-[#EFA38F] px-4 py-3 text-sm font-semibold text-zinc-900 shadow-2xl">
          {toast.from} offered a trade to {toast.to}
        </div>
      ) : null}

      {tradeOffer && isRecipient ? (
        <div className="fixed inset-0 z-modal flex items-center justify-center bg-black/70 px-4 py-8 text-zinc-900">
          <section className="w-full max-w-2xl rounded-lg border border-[#d28b7a] bg-[#F7F0E4] p-5 shadow-2xl">
            <div>
              <p className="text-sm uppercase tracking-[0.18em] text-zinc-700 font-bold">Trade offer</p>
              <h2 className="mt-1 text-2xl font-black text-zinc-900">{fromPlayer?.username ?? 'A player'} wants to trade</h2>
              <p className="mt-1 text-sm text-zinc-700">Review the exchange before responding.</p>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <OfferSide
                title={`${fromPlayer?.username ?? 'They'} gives`}
                propertyIds={tradeOffer.offeredProperties}
                cash={tradeOffer.offeredCash}
                jailCards={tradeOffer.offeredJailCards}
              />
              <OfferSide
                title="You give"
                propertyIds={tradeOffer.requestedProperties}
                cash={tradeOffer.requestedCash}
                jailCards={tradeOffer.requestedJailCards}
              />
            </div>

            {error ? <p className="mt-4 text-sm font-bold text-red-900">{error}</p> : null}

            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => void respond(tradeOffer, false)}
                disabled={submitting !== null}
                className="rounded-md border border-[#d28b7a] bg-white/20 px-4 py-2 text-sm font-bold text-zinc-800 hover:border-[#b86e5e] hover:bg-white/40 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting === 'reject' ? 'Rejecting...' : 'Reject'}
              </button>
              <button
                onClick={() => void respond(tradeOffer, true)}
                disabled={submitting !== null}
                className="rounded-md bg-[#1a472a] px-4 py-2 text-sm font-black text-white hover:bg-[#235d38] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting === 'accept' ? 'Accepting...' : 'Accept'}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  )
}
