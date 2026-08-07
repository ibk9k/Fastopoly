import type { JsonStorage, TradeOffer } from '@/lib/liveblocks.config'

/**
 * Pure helpers for the multi-offer trade model.
 *
 * A negotiation is a chain of immutable offers: countering closes the parent and
 * appends a child pointing at it. Nothing mutates an offer's terms in place, so an
 * acceptance can only ever settle the exact terms that were displayed.
 */

/** Pending offers a room may hold at once, and the history depth kept beyond them. */
export const MAX_PENDING_OFFERS_PER_PLAYER = 5
export const MAX_STORED_OFFERS = 30

export const TERMINAL_STATUSES = ['accepted', 'rejected', 'countered', 'cancelled'] as const

/**
 * The most cash a player can put into an offer.
 *
 * Clamped at zero because a player in debt has NEGATIVE cash, and a naive
 * `amount > player.cash` then rejects even an all-property offer of $0 — locking
 * the one player who most needs to trade out of trading. Debt is resolved by
 * raising funds, and a trade is a legitimate way to do it.
 */
export function maxOfferableCash(cash: number): number {
  return Math.max(cash, 0)
}

/** True when `amount` is a legal cash component for a player holding `cash`. */
export function canOfferCash(cash: number, amount: number): boolean {
  return amount >= 0 && amount <= maxOfferableCash(cash)
}

export function offersOf(storage: JsonStorage): TradeOffer[] {
  return storage.tradeOffers ?? []
}

export function pendingOffers(offers: readonly TradeOffer[]): TradeOffer[] {
  return offers.filter((offer) => offer.status === 'pending')
}

export function findOffer(offers: readonly TradeOffer[], offerId: string): TradeOffer | undefined {
  return offers.find((offer) => offer.id === offerId)
}

/** Pending offers this player still owes an answer on. */
export function offersAwaiting(offers: readonly TradeOffer[], playerId: string): TradeOffer[] {
  return pendingOffers(offers).filter((offer) => offer.toPlayerId === playerId)
}

export function countPendingFrom(offers: readonly TradeOffer[], playerId: string): number {
  return pendingOffers(offers).filter((offer) => offer.fromPlayerId === playerId).length
}

/**
 * Appends an offer and trims history. Pending offers are never dropped — only
 * settled ones age out, so pruning can't silently cancel a live negotiation.
 */
export function appendOffer(
  offers: readonly TradeOffer[],
  offer: TradeOffer,
): TradeOffer[] {
  const next = [...offers, offer]
  if (next.length <= MAX_STORED_OFFERS) return next

  const pending = next.filter((entry) => entry.status === 'pending')
  const settled = next.filter((entry) => entry.status !== 'pending')
  const keepSettled = Math.max(0, MAX_STORED_OFFERS - pending.length)
  const trimmedSettled = settled.slice(settled.length - keepSettled)

  // Preserve original ordering rather than concatenating the two buckets.
  const keep = new Set([...pending, ...trimmedSettled].map((entry) => entry.id))
  return next.filter((entry) => keep.has(entry.id))
}

export function setStatus(
  offers: readonly TradeOffer[],
  offerId: string,
  status: TradeOffer['status'],
): TradeOffer[] {
  return offers.map((offer) => (offer.id === offerId ? { ...offer, status } : offer))
}

/**
 * Cancels every pending offer involving a player. Used when they go bankrupt or
 * leave: an offer whose counterparty no longer exists can never be settled, and
 * would otherwise sit in the panel forever.
 */
export function cancelOffersInvolving(
  offers: readonly TradeOffer[],
  playerId: string,
): TradeOffer[] {
  return offers.map((offer) =>
    offer.status === 'pending' && (offer.fromPlayerId === playerId || offer.toPlayerId === playerId)
      ? { ...offer, status: 'cancelled' as const }
      : offer,
  )
}
