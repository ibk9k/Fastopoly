import { NextRequest, NextResponse } from 'next/server'
import { badRequest, routeError } from '@/lib/game-engine/route-utils'
import { addLog, broadcastRoomEvent, endTurn, mutateGameStorage } from '@/lib/game-engine/server-state'

export async function POST(req: NextRequest) {
  try {
    const { roomId, playerId } = (await req.json()) as { roomId?: string; playerId?: string }
    if (!roomId) return badRequest('Missing roomId')
    if (!playerId) return badRequest('Missing playerId')

    await mutateGameStorage(roomId, (storage) => {
      const player = storage.players.find((p) => p.id === playerId)
      if (!player) throw new Error('Player not found')
      if (player.isBankrupt) throw new Error('Player is already bankrupt')

      // Return all properties to the bank
      player.properties.forEach((propertyId) => {
        const property = storage.properties[propertyId]
        if (!property) return
        property.ownerId = null
        property.houses = 0
        property.hotels = 0
        property.mortgaged = false
      })

      player.properties = []
      player.cash = 0
      player.isBankrupt = true

      addLog(storage, `${player.username} declared bankruptcy.`)
      endTurn(storage)
    })

    await broadcastRoomEvent(roomId, { type: 'PLAYER_BANKRUPT', playerId, creditorId: 'bank' })

    return NextResponse.json({ success: true })
  } catch (error) {
    return routeError(error, 'Bankruptcy failed')
  }
}
