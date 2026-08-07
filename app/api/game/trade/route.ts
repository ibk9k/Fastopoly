import { NextRequest, NextResponse } from 'next/server'
import type { TradeOffer } from '@/lib/liveblocks.config'
import type { JsonStorage } from '@/lib/liveblocks.config'
import { getTile } from '@/lib/game-engine/board'
import { AuthError, authenticatePlayer, readPlayerToken } from '@/lib/game-engine/auth'
import { badRequest, routeError } from '@/lib/game-engine/route-utils'
import { addLog, broadcastRoomEvent, mutateGameStorage, propertyMap, toPropertyRecord } from '@/lib/game-engine/server-state'
import { nanoid } from 'nanoid'
import {
  MAX_PENDING_OFFERS_PER_PLAYER,
  appendOffer,
  canOfferCash,
  countPendingFrom,
  findOffer,
  offersOf,
  setStatus,
} from '@/lib/game-engine/trades'

type TradeBody = {
  roomId?: string
  playerId?: string
  action?: 'propose' | 'respond' | 'counter' | 'cancel'
  /** Which offer 'respond', 'counter' and 'cancel' address. */
  offerId?: string
  offer?: TradeOffer
  accept?: boolean
}

class TradeValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TradeValidationError'
  }
}

function validateTradeProposal(storage: JsonStorage, offer: TradeOffer): void {
  if (offer.fromPlayerId === offer.toPlayerId) {
    throw new TradeValidationError('Cannot trade with yourself')
  }

  if (offer.offeredCash < 0 || offer.requestedCash < 0) {
    throw new TradeValidationError('Trade cash amounts cannot be negative')
  }

  const fromPlayer = storage.players.find((player) => player.id === offer.fromPlayerId)
  const toPlayer = storage.players.find((player) => player.id === offer.toPlayerId)
  if (!fromPlayer || !toPlayer) {
    throw new TradeValidationError('Trade players were not found')
  }

  const properties = propertyMap(storage.properties)

  const invalidOffered = offer.offeredProperties.find((propertyId) => properties.get(propertyId)?.ownerId !== fromPlayer.id)
  if (invalidOffered) {
    throw new TradeValidationError('Offered properties must be owned by the proposing player')
  }

  const invalidRequested = offer.requestedProperties.find((propertyId) => properties.get(propertyId)?.ownerId !== toPlayer.id)
  if (invalidRequested) {
    throw new TradeValidationError('Requested properties must be owned by the target player')
  }

  const builtProperty = [...offer.offeredProperties, ...offer.requestedProperties].find((propertyId) => {
    const property = properties.get(propertyId)
    return property ? property.houses > 0 || property.hotels > 0 : false
  })
  if (builtProperty) {
    throw new TradeValidationError('Properties with houses or hotels cannot be traded')
  }

  // Clamped at zero: a player in debt holds negative cash, and comparing against it
  // directly rejected even a $0 offer, barring the player who most needs to trade
  // from trading at all.
  if (!canOfferCash(fromPlayer.cash, offer.offeredCash)) {
    throw new TradeValidationError('Offered cash exceeds proposing player cash')
  }

  if (!canOfferCash(toPlayer.cash, offer.requestedCash)) {
    throw new TradeValidationError('Requested cash exceeds target player cash')
  }

  if ((offer.offeredJailCards ?? 0) > fromPlayer.getOutOfJailCards) {
    throw new TradeValidationError('Proposer does not hold that many Get Out of Jail cards')
  }
  if ((offer.requestedJailCards ?? 0) > toPlayer.getOutOfJailCards) {
    throw new TradeValidationError('Target does not hold that many Get Out of Jail cards')
  }
  if ((offer.offeredJailCards ?? 0) < 0 || (offer.requestedJailCards ?? 0) < 0) {
    throw new TradeValidationError('Jail card counts cannot be negative')
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as TradeBody
    if (!body.roomId || !body.action) return badRequest('Missing trade fields')
    const roomId = body.roomId
    const token = readPlayerToken(req)

    let event: unknown | null = null
    await mutateGameStorage(roomId, (storage) => {
      const caller = authenticatePlayer(storage, roomId, body.playerId, token)

      const offers = offersOf(storage)

      // Propose and counter both create an offer; a counter additionally closes the
      // one it answers. Neither touches gamePhase — with several trades in flight a
      // pending offer cannot be allowed to freeze the board, which the old single-
      // offer model did by switching the phase to 'trade'.
      if (body.action === 'propose' || body.action === 'counter') {
        if (!body.offer) throw new Error('Missing trade offer')

        let parent: TradeOffer | undefined
        if (body.action === 'counter') {
          if (!body.offerId) throw new Error('Missing offer to counter')
          parent = findOffer(offers, body.offerId)
          if (!parent) throw new Error('That trade offer no longer exists')
          if (parent.status !== 'pending') throw new Error('That trade has already been settled')
          if (caller.id !== parent.toPlayerId) {
            throw new AuthError('Only the recipient can counter an offer')
          }
        }

        if (caller.id !== body.offer.fromPlayerId) {
          throw new AuthError('You can only propose a trade on your own behalf')
        }
        if (countPendingFrom(offers, caller.id) >= MAX_PENDING_OFFERS_PER_PLAYER) {
          throw new TradeValidationError(
            `You already have ${MAX_PENDING_OFFERS_PER_PLAYER} offers pending`,
          )
        }
        validateTradeProposal(storage, body.offer)

        const created: TradeOffer = {
          ...body.offer,
          id: nanoid(),
          status: 'pending',
          createdAt: Date.now(),
          counterOfId: parent?.id ?? null,
        }

        let next = parent ? setStatus(offers, parent.id, 'countered') : offers
        next = appendOffer(next, created)
        storage.tradeOffers = next

        const fromName = caller.username
        const toName =
          storage.players.find((player) => player.id === created.toPlayerId)?.username ?? 'a player'
        addLog(
          storage,
          parent ? `${fromName} countered ${toName}'s trade.` : `${fromName} offered ${toName} a trade.`,
        )
        event = { type: 'TRADE_OFFERED', offer: created }
        return
      }

      if (!body.offerId) throw new Error('Missing offer id')
      const offer = findOffer(offers, body.offerId)
      if (!offer) throw new Error('That trade offer no longer exists')
      if (offer.status !== 'pending') throw new Error('That trade has already been settled')

      // Withdrawing your own offer is the proposer's right; answering it is the
      // recipient's. Neither may do the other's.
      if (body.action === 'cancel') {
        if (caller.id !== offer.fromPlayerId) {
          throw new AuthError('Only the player who made an offer can withdraw it')
        }
        storage.tradeOffers = setStatus(offers, offer.id, 'cancelled')
        addLog(storage, `${caller.username} withdrew a trade offer.`)
        return
      }

      if (caller.id !== offer.toPlayerId) {
        throw new AuthError('Only the trade recipient can respond to this offer')
      }
      if (!body.accept) {
        storage.tradeOffers = setStatus(offers, offer.id, 'rejected')
        addLog(storage, 'Trade rejected.')
        return
      }

      // Re-validate at accept time: ownership/cash/mortgage state may have changed since the proposal.
      validateTradeProposal(storage, offer)

      const from = storage.players.find((player) => player.id === offer.fromPlayerId)
      const to = storage.players.find((player) => player.id === offer.toPlayerId)
      if (!from || !to) throw new Error('Trade players not found')
      const properties = propertyMap(storage.properties)

      from.cash = from.cash - offer.offeredCash + offer.requestedCash
      to.cash = to.cash - offer.requestedCash + offer.offeredCash

      // Receiving a mortgaged property costs 10% interest to the bank right away.
      let fromInterest = 0
      let toInterest = 0
      offer.offeredProperties.forEach((id) => {
        const property = properties.get(id)
        if (!property) return
        property.ownerId = to.id
        if (property.mortgaged) toInterest += Math.ceil((getTile(id)?.mortgage ?? 0) * 0.1)
      })
      offer.requestedProperties.forEach((id) => {
        const property = properties.get(id)
        if (!property) return
        property.ownerId = from.id
        if (property.mortgaged) fromInterest += Math.ceil((getTile(id)?.mortgage ?? 0) * 0.1)
      })
      from.cash -= fromInterest
      to.cash -= toInterest

      // Get Out of Jail cards change hands too.
      const offeredCards = offer.offeredJailCards ?? 0
      const requestedCards = offer.requestedJailCards ?? 0
      from.getOutOfJailCards = from.getOutOfJailCards - offeredCards + requestedCards
      to.getOutOfJailCards = to.getOutOfJailCards - requestedCards + offeredCards

      from.properties = [...from.properties.filter((id) => !offer.offeredProperties.includes(id)), ...offer.requestedProperties]
      to.properties = [...to.properties.filter((id) => !offer.requestedProperties.includes(id)), ...offer.offeredProperties]
      storage.properties = toPropertyRecord(properties)
      // Settling one offer invalidates nothing else automatically — other pending
      // offers are re-validated when they are themselves accepted, so a trade that
      // gave away a requested property simply fails at that point with a clear error.
      storage.tradeOffers = setStatus(offers, offer.id, 'accepted')
      addLog(storage, 'Trade accepted.')
      if (fromInterest > 0 || toInterest > 0) {
        addLog(storage, `Mortgage transfer interest paid: ${[fromInterest > 0 ? `${from.username} $${fromInterest}` : '', toInterest > 0 ? `${to.username} $${toInterest}` : ''].filter(Boolean).join(', ')}.`)
      }
    })

    if (event) await broadcastRoomEvent(body.roomId, event)
    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof TradeValidationError) {
      return badRequest(error.message)
    }
    return routeError(error, 'Trade failed')
  }
}
