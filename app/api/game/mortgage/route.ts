import { NextRequest, NextResponse } from 'next/server'
import { getTile } from '@/lib/game-engine/board'
import { authenticatePlayer, readPlayerToken } from '@/lib/game-engine/auth'
import { assertGamePhase, assertIsActivePlayer } from '@/lib/game-engine/guards'
import { badRequest, routeError } from '@/lib/game-engine/route-utils'
import { addLog, mutateGameStorage, propertyMap, refreshTurnDeadline, toPropertyRecord } from '@/lib/game-engine/server-state'

export async function POST(req: NextRequest) {
  try {
    const { roomId, playerId, propertyId, action } = (await req.json()) as {
      roomId?: string
      playerId?: string
      propertyId?: string
      action?: 'mortgage' | 'unmortgage' | 'sell'
    }
    if (!roomId || !playerId || !propertyId || !action) return badRequest('Missing mortgage fields')
    const token = readPlayerToken(req)

    await mutateGameStorage(roomId, (storage) => {
      const player = authenticatePlayer(storage, roomId, playerId, token)
      assertGamePhase(storage, ['playing', 'landed', 'buy_decision'])
      assertIsActivePlayer(storage, player.id)
      refreshTurnDeadline(storage)
      const tile = getTile(propertyId)
      const properties = propertyMap(storage.properties)
      const property = properties.get(propertyId)
      if (!tile || !property) throw new Error('Invalid player or property')
      if (property.ownerId !== player.id) throw new Error('Player does not own property')
      if (property.houses > 0 || property.hotels > 0) throw new Error('Cannot mortgage or sell property with buildings')

      const mortgageValue = tile.mortgage ?? 0
      if (action === 'mortgage') {
        if (property.mortgaged) throw new Error('Property already mortgaged')
        property.mortgaged = true
        player.cash += mortgageValue
        addLog(storage, `${player.username} mortgaged ${tile.name}.`)
      } else if (action === 'unmortgage') {
        const cost = Math.ceil(mortgageValue * 1.1)
        if (!property.mortgaged) throw new Error('Property is not mortgaged')
        if (player.cash < cost) throw new Error('Insufficient cash')
        property.mortgaged = false
        player.cash -= cost
        addLog(storage, `${player.username} unmortgaged ${tile.name}.`)
      } else if (action === 'sell') {
        if (property.mortgaged) throw new Error('Cannot sell a mortgaged property')
        const sellPrice = Math.floor((tile.price ?? 0) / 2)
        property.ownerId = null
        property.mortgaged = false
        player.properties = player.properties.filter((id) => id !== propertyId)
        player.cash += sellPrice
        addLog(storage, `${player.username} sold ${tile.name} to the Bank for $${sellPrice}.`)
      }

      storage.properties = toPropertyRecord(properties)
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return routeError(error, 'Property action failed')
  }
}
