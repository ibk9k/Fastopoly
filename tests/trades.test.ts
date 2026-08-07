import { describe, expect, it } from 'vitest'
import type { TradeOffer } from '@/lib/liveblocks.config'
import {
  MAX_STORED_OFFERS,
  appendOffer,
  canOfferCash,
  cancelOffersInvolving,
  countPendingFrom,
  findOffer,
  maxOfferableCash,
  offersAwaiting,
  pendingOffers,
  setStatus,
} from '@/lib/game-engine/trades'

function offer(overrides: Partial<TradeOffer> = {}): TradeOffer {
  return {
    id: 'o1',
    fromPlayerId: 'player-1',
    toPlayerId: 'player-2',
    offeredProperties: [],
    requestedProperties: [],
    offeredCash: 0,
    requestedCash: 0,
    status: 'pending',
    createdAt: 1,
    counterOfId: null,
    ...overrides,
  }
}

describe('canOfferCash', () => {
  it('lets a solvent player offer up to their balance', () => {
    expect(canOfferCash(500, 0)).toBe(true)
    expect(canOfferCash(500, 500)).toBe(true)
    expect(canOfferCash(500, 501)).toBe(false)
  })

  it('lets a player in debt still trade, as long as they offer no cash', () => {
    // Regression: the old check was `amount > player.cash`, so with cash of -305 an
    // offer of $0 compared 0 > -305 and was rejected. That barred the one player who
    // most needs to trade — someone in debt raising funds to avoid bankruptcy — from
    // offering properties at all.
    expect(canOfferCash(-305, 0)).toBe(true)
    expect(canOfferCash(-305, 1)).toBe(false)
  })

  it('rejects negative amounts', () => {
    expect(canOfferCash(500, -1)).toBe(false)
  })

  it('caps the offerable amount at zero for a debtor', () => {
    expect(maxOfferableCash(-305)).toBe(0)
    expect(maxOfferableCash(240)).toBe(240)
  })
})

describe('pendingOffers / offersAwaiting', () => {
  it('ignores settled offers', () => {
    const offers = [
      offer({ id: 'a', status: 'pending' }),
      offer({ id: 'b', status: 'accepted' }),
      offer({ id: 'c', status: 'countered' }),
      offer({ id: 'd', status: 'cancelled' }),
    ]
    expect(pendingOffers(offers).map((entry) => entry.id)).toEqual(['a'])
  })

  it('only surfaces offers the player must answer', () => {
    const offers = [
      offer({ id: 'incoming', toPlayerId: 'player-2' }),
      offer({ id: 'outgoing', fromPlayerId: 'player-2', toPlayerId: 'player-3' }),
    ]
    expect(offersAwaiting(offers, 'player-2').map((entry) => entry.id)).toEqual(['incoming'])
  })
})

describe('countPendingFrom', () => {
  it('counts only that player\'s live offers', () => {
    const offers = [
      offer({ id: 'a', fromPlayerId: 'player-1' }),
      offer({ id: 'b', fromPlayerId: 'player-1', status: 'rejected' }),
      offer({ id: 'c', fromPlayerId: 'player-2' }),
    ]
    expect(countPendingFrom(offers, 'player-1')).toBe(1)
  })
})

describe('setStatus', () => {
  it('closes one offer without touching the others', () => {
    const offers = [offer({ id: 'a' }), offer({ id: 'b' })]
    const next = setStatus(offers, 'a', 'countered')
    expect(next.find((entry) => entry.id === 'a')?.status).toBe('countered')
    expect(next.find((entry) => entry.id === 'b')?.status).toBe('pending')
  })
})

describe('appendOffer', () => {
  it('keeps history bounded', () => {
    const settled = Array.from({ length: MAX_STORED_OFFERS }, (_, index) =>
      offer({ id: `s${index}`, status: 'rejected' }),
    )
    const next = appendOffer(settled, offer({ id: 'fresh' }))
    expect(next).toHaveLength(MAX_STORED_OFFERS)
    expect(findOffer(next, 'fresh')).toBeDefined()
  })

  it('never prunes a pending offer', () => {
    // Pruning a live negotiation would silently cancel it for both players.
    const pending = Array.from({ length: MAX_STORED_OFFERS }, (_, index) =>
      offer({ id: `p${index}`, status: 'pending' }),
    )
    const next = appendOffer(pending, offer({ id: 'fresh' }))
    expect(next.filter((entry) => entry.status === 'pending')).toHaveLength(MAX_STORED_OFFERS + 1)
  })

  it('preserves chronological order when trimming', () => {
    const mixed = [
      offer({ id: 'old', status: 'rejected' }),
      offer({ id: 'live', status: 'pending' }),
      ...Array.from({ length: MAX_STORED_OFFERS - 1 }, (_, index) =>
        offer({ id: `r${index}`, status: 'rejected' }),
      ),
    ]
    const next = appendOffer(mixed, offer({ id: 'newest' }))
    const ids = next.map((entry) => entry.id)
    expect(ids.indexOf('live')).toBeLessThan(ids.indexOf('newest'))
    expect(next.length).toBeLessThanOrEqual(MAX_STORED_OFFERS + 1)
  })
})

describe('cancelOffersInvolving', () => {
  it('closes pending offers on both sides of a departing player', () => {
    const offers = [
      offer({ id: 'to-them', toPlayerId: 'player-3' }),
      offer({ id: 'from-them', fromPlayerId: 'player-3', toPlayerId: 'player-1' }),
      offer({ id: 'unrelated', fromPlayerId: 'player-1', toPlayerId: 'player-2' }),
    ]
    const next = cancelOffersInvolving(offers, 'player-3')
    expect(next.find((entry) => entry.id === 'to-them')?.status).toBe('cancelled')
    expect(next.find((entry) => entry.id === 'from-them')?.status).toBe('cancelled')
    expect(next.find((entry) => entry.id === 'unrelated')?.status).toBe('pending')
  })

  it('leaves already-settled offers alone', () => {
    const offers = [offer({ id: 'done', toPlayerId: 'player-3', status: 'accepted' })]
    expect(cancelOffersInvolving(offers, 'player-3')[0].status).toBe('accepted')
  })
})
