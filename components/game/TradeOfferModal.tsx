'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { playCue } from '@/lib/game-client/audio'
import type { TradeOffer } from '@/lib/liveblocks.config'
import { useEventListener, useSelf, useStorage } from '@/lib/liveblocks.config'
import { offersAwaiting } from '@/lib/game-engine/trades'
import { formatMoney, postJson, propertyDisplayName, resolveLocalPlayer } from '@/components/game/helpers'

type TradeOfferModalProps = {
  roomId: string
  onCounter: (offer: TradeOffer) => void
  /** Explicitly opened from the Active Trades list; overrides the auto-popup. */
  viewOfferId?: string | null
  onCloseView?: () => void
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

/**
 * The "an offer just arrived" popup for the newest trade awaiting this player.
 *
 * Dismissing it hides it locally only — the offer stays pending in storage and can
 * be reopened from Active Trades, which is the point of moving trades to a list.
 * The modal no longer blocks the game: several offers can be outstanding, and the
 * game phase is not switched while one is pending.
 */
export default function TradeOfferModal({
  roomId,
  onCounter,
  viewOfferId = null,
  onCloseView,
}: TradeOfferModalProps) {
  const self = useSelf()
  const storedPlayers = useStorage((root) => root.players)
  const players = useMemo(() => storedPlayers ?? [], [storedPlayers])
  const storedOffers = useStorage((root) => root.tradeOffers)
  const selfPlayer = resolveLocalPlayer(players, self)

  const [dismissed, setDismissed] = useState<string[]>([])
  const [toast, setToast] = useState<TradeToast | null>(null)
  const [submitting, setSubmitting] = useState<'accept' | 'reject' | null>(null)
  const [error, setError] = useState('')

  const offer = useMemo(() => {
    const all = storedOffers ?? []
    // An explicitly opened offer wins, and may be one you sent — the list is public,
    // so viewing a trade between two other players is legitimate too.
    if (viewOfferId) return all.find((candidate) => candidate.id === viewOfferId) ?? null
    if (!selfPlayer) return null
    const waiting = offersAwaiting(all, selfPlayer.id).filter(
      (candidate) => !dismissed.includes(candidate.id),
    )
    return waiting.length ? waiting[waiting.length - 1] : null
  }, [storedOffers, selfPlayer, dismissed, viewOfferId])

  const isRecipient = Boolean(offer && selfPlayer && offer.toPlayerId === selfPlayer.id)
  const isProposer = Boolean(offer && selfPlayer && offer.fromPlayerId === selfPlayer.id)

  function close() {
    if (viewOfferId) {
      onCloseView?.()
      return
    }
    if (offer) setDismissed((current) => [...current, offer.id])
  }

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

  // Ping once per offer, recipient only. Keyed on the offer id so a second trade
  // arriving while the first is open still announces itself.
  const pingedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!offer) return
    if (pingedRef.current === offer.id) return
    pingedRef.current = offer.id
    playCue('trade-offer')
  }, [offer])

  async function respond(target: TradeOffer, accept: boolean) {
    setSubmitting(accept ? 'accept' : 'reject')
    setError('')
    try {
      await postJson<TradeResponse>('/api/game/trade', {
        roomId,
        playerId: selfPlayer?.id,
        offerId: target.id,
        action: 'respond',
        accept,
      })
    } catch (responseError) {
      setError(responseError instanceof Error ? responseError.message : 'Trade response failed')
    } finally {
      setSubmitting(null)
    }
  }

  async function withdraw(target: TradeOffer) {
    setSubmitting('reject')
    setError('')
    try {
      await postJson<TradeResponse>('/api/game/trade', {
        roomId,
        playerId: selfPlayer?.id,
        offerId: target.id,
        action: 'cancel',
      })
      onCloseView?.()
    } catch (responseError) {
      setError(responseError instanceof Error ? responseError.message : 'Could not withdraw offer')
    } finally {
      setSubmitting(null)
    }
  }

  const fromPlayer = offer ? players.find((player) => player.id === offer.fromPlayerId) : undefined

  return (
    <>
      {toast ? (
        <div className="fixed right-4 top-16 z-toast max-w-sm rounded-md border border-[#d28b7a] bg-[#EFA38F] px-4 py-3 text-sm font-semibold text-zinc-900 shadow-2xl">
          {toast.from} offered a trade to {toast.to}
        </div>
      ) : null}

      {offer ? (
        <div className="fixed inset-0 z-modal flex items-center justify-center bg-black/70 px-4 py-8 text-zinc-900">
          <section className="w-full max-w-2xl rounded-lg border border-[#d28b7a] bg-[#F7F0E4] p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-[0.18em] text-zinc-700 font-bold">
                  {offer.counterOfId ? 'Counter offer' : 'Trade offer'}
                </p>
                <h2 className="mt-1 text-2xl font-black text-zinc-900">{fromPlayer?.username ?? 'A player'} wants to trade</h2>
                <p className="mt-1 text-sm text-zinc-700">Review the exchange before responding.</p>
              </div>
              <button
                onClick={close}
                aria-label="Close — the offer stays in Active Trades"
                title="Close — the offer stays in Active Trades"
                className="rounded-md border border-[#d28b7a] px-2.5 py-1 text-sm font-black text-zinc-700 transition-transform active:scale-95 hover:bg-white/40"
              >
                ✕
              </button>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <OfferSide
                title={`${fromPlayer?.username ?? 'They'} gives`}
                propertyIds={offer.offeredProperties}
                cash={offer.offeredCash}
                jailCards={offer.offeredJailCards}
              />
              <OfferSide
                title="You give"
                propertyIds={offer.requestedProperties}
                cash={offer.requestedCash}
                jailCards={offer.requestedJailCards}
              />
            </div>

            {error ? <p className="mt-4 text-sm font-bold text-red-900">{error}</p> : null}

            {/* Controls follow the viewer's role. A spectator sees the terms only —
              * the server enforces the same rule from the seat token regardless. */}
            <div className="mt-5 flex flex-wrap justify-end gap-3">
              {isRecipient ? (
                <>
                  <button
                    onClick={() => {
                      close()
                      onCounter(offer)
                    }}
                    disabled={submitting !== null}
                    className="rounded-md border border-[#1a472a]/40 bg-white/20 px-4 py-2 text-sm font-bold text-[#1a472a] hover:bg-white/40 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Counter
                  </button>
                  <button
                    onClick={() => void respond(offer, false)}
                    disabled={submitting !== null}
                    className="rounded-md border border-[#d28b7a] bg-white/20 px-4 py-2 text-sm font-bold text-zinc-800 hover:border-[#b86e5e] hover:bg-white/40 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {submitting === 'reject' ? 'Rejecting...' : 'Reject'}
                  </button>
                  <button
                    onClick={() => void respond(offer, true)}
                    disabled={submitting !== null}
                    className="rounded-md bg-[#1a472a] px-4 py-2 text-sm font-black text-white hover:bg-[#235d38] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {submitting === 'accept' ? 'Accepting...' : 'Accept'}
                  </button>
                </>
              ) : isProposer ? (
                <button
                  onClick={() => void withdraw(offer)}
                  disabled={submitting !== null}
                  className="rounded-md border border-[#d28b7a] bg-white/20 px-4 py-2 text-sm font-bold text-zinc-800 hover:border-[#b86e5e] hover:bg-white/40 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting === 'reject' ? 'Withdrawing...' : 'Withdraw offer'}
                </button>
              ) : (
                <p className="self-center text-sm font-semibold text-zinc-600">
                  Waiting on their answer.
                </p>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </>
  )
}
