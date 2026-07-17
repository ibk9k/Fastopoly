import { NextRequest, NextResponse } from 'next/server'
import type { TradeOffer } from '@/lib/liveblocks.config'
import type { JsonStorage } from '@/lib/liveblocks.config'
import { getTile } from '@/lib/game-engine/board'
import { AuthError, authenticatePlayer, readPlayerToken } from '@/lib/game-engine/auth'
import { badRequest, routeError } from '@/lib/game-engine/route-utils'
import { addLog, broadcastRoomEvent, mutateGameStorage, propertyMap, toPropertyRecord } from '@/lib/game-engine/server-state'

type TradeBody = {
  roomId?: string
  playerId?: string
  action?: 'propose' | 'respond'
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

  if (offer.offeredCash > fromPlayer.cash) {
    throw new TradeValidationError('Offered cash exceeds proposing player cash')
  }

  if (offer.requestedCash > toPlayer.cash) {
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

      if (body.action === 'propose') {
        if (!body.offer) throw new Error('Missing trade offer')
        if (caller.id !== body.offer.fromPlayerId) {
          throw new AuthError('You can only propose a trade on your own behalf')
        }
        validateTradeProposal(storage, body.offer)
        storage.tradeOffer = body.offer
        storage.gamePhase = 'trade'
        addLog(storage, 'Trade offered.')
        event = { type: 'TRADE_OFFERED', offer: body.offer }
        return
      }

      const offer = storage.tradeOffer
      if (!offer) throw new Error('No pending trade offer')
      if (caller.id !== offer.toPlayerId) {
        throw new AuthError('Only the trade recipient can respond to this offer')
      }
      if (!body.accept) {
        storage.tradeOffer = null
        storage.gamePhase = 'playing'
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
      storage.tradeOffer = null
      storage.gamePhase = 'playing'
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
