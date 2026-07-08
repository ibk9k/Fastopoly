import { NextRequest, NextResponse } from 'next/server'
import { nanoid } from 'nanoid'
import { getTile } from '@/lib/game-engine/board'
import { badRequest, routeError } from '@/lib/game-engine/route-utils'
import { transactionalMutate } from '@/lib/game-engine/server-state'

export async function POST(req: NextRequest) {
  try {
    const { roomId, playerId, propertyId } = (await req.json()) as { roomId?: string; playerId?: string; propertyId?: string }
    if (!roomId || !playerId || !propertyId) return badRequest('Missing buy fields')

    const result = await transactionalMutate(roomId, (root) => {
      // 1. Validate game phase
      const gamePhase = root.get('gamePhase') as string
      if (gamePhase !== 'buy_decision' && gamePhase !== 'landed') {
        throw new Error(`Expected game phase buy_decision or landed, got ${gamePhase}`)
      }

      // 2. Validate active player
      const players = root.get('players') as any[]
      const currentPlayerIndex = root.get('currentPlayerIndex') as number
      const activePlayer = players[currentPlayerIndex]
      if (!activePlayer || activePlayer.id !== playerId || activePlayer.isBankrupt) {
        throw new Error('Not the active player')
      }

      // 3. Validate property (Note: properties is a plain JavaScript object)
      const properties = root.get('properties') as Record<string, any>
      const property = properties[propertyId]
      const tile = getTile(propertyId)
      if (!tile?.price || !property) throw new Error('Invalid property')
      if (property.ownerId) throw new Error('Property already owned')

      // 4. Validate cash
      if (activePlayer.cash < tile.price) throw new Error('Insufficient cash')

      // 5. Apply mutations (using standard arrays and dot notation)
      activePlayer.cash -= tile.price
      property.ownerId = playerId
      activePlayer.properties.push(propertyId)
      
      // Commit plain object/array updates back to Liveblocks root
      root.set('players', players)
      root.set('properties', properties)

      // 6. Log transaction
      const log = root.get('log') as any[]
      log.push({
        id: nanoid(),
        message: `${activePlayer.username} bought ${tile.name} for $${tile.price}.`,
        timestamp: Date.now(),
      })
      root.set('log', log)

      // 7. Post landing logic
      const lastRollWasDoubles = root.get('lastRollWasDoubles') as boolean
      if (lastRollWasDoubles) {
        root.set('lastRollWasDoubles', false)
        root.set('hasRolled', false)
        log.push({
          id: nanoid(),
          message: `${activePlayer.username} gets another roll for rolling doubles!`,
          timestamp: Date.now(),
        })
        root.set('log', log)
        root.set('hasRolled', false)
        root.set('lastRollWasDoubles', false)
      }
      root.set('gamePhase', 'playing')

      return { success: true }
    })

    return NextResponse.json(result)
  } catch (error) {
    return routeError(error, 'Buy failed')
  }
}
