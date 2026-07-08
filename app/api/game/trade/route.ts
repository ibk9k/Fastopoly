import { NextRequest, NextResponse } from 'next/server'
import type { TradeOffer } from '@/lib/liveblocks.config'
import type { JsonStorage } from '@/lib/liveblocks.config'
import { badRequest, routeError } from '@/lib/game-engine/route-utils'
import { addLog, broadcastRoomEvent, mutateGameStorage, propertyMap, toPropertyRecord } from '@/lib/game-engine/server-state'

type TradeBody = {
  roomId?: string
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
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as TradeBody
    if (!body.roomId || !body.action) return badRequest('Missing trade fields')

    let event: unknown | null = null
    await mutateGameStorage(body.roomId, (storage) => {
      if (body.action === 'propose') {
        if (!body.offer) throw new Error('Missing trade offer')
        validateTradeProposal(storage, body.offer)
        storage.tradeOffer = body.offer
        storage.gamePhase = 'trade'
        addLog(storage, 'Trade offered.')
        event = { type: 'TRADE_OFFERED', offer: body.offer }
        return
      }

      const offer = storage.tradeOffer
      if (!offer) throw new Error('No pending trade offer')
      if (!body.accept) {
        storage.tradeOffer = null
        storage.gamePhase = 'playing'
        addLog(storage, 'Trade rejected.')
        return
      }

      const from = storage.players.find((player) => player.id === offer.fromPlayerId)
      const to = storage.players.find((player) => player.id === offer.toPlayerId)
      if (!from || !to) throw new Error('Trade players not found')
      const properties = propertyMap(storage.properties)

      from.cash = from.cash - offer.offeredCash + offer.requestedCash
      to.cash = to.cash - offer.requestedCash + offer.offeredCash
      offer.offeredProperties.forEach((id) => {
        const property = properties.get(id)
        if (property) property.ownerId = to.id
      })
      offer.requestedProperties.forEach((id) => {
        const property = properties.get(id)
        if (property) property.ownerId = from.id
      })
      from.properties = [...from.properties.filter((id) => !offer.offeredProperties.includes(id)), ...offer.requestedProperties]
      to.properties = [...to.properties.filter((id) => !offer.requestedProperties.includes(id)), ...offer.offeredProperties]
      storage.properties = toPropertyRecord(properties)
      storage.tradeOffer = null
      storage.gamePhase = 'playing'
      addLog(storage, 'Trade accepted.')
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
