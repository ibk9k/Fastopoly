import { NextRequest, NextResponse } from 'next/server'
import { assertGamePhase, assertIsActivePlayer } from '@/lib/game-engine/guards'
import { badRequest, rollDice, routeError } from '@/lib/game-engine/route-utils'
import { addLog, broadcastRoomEvent, mutateGameStorage } from '@/lib/game-engine/server-state'
import { sendToJail } from '@/lib/game-engine/actions'

export async function POST(req: NextRequest) {
  try {
    const { roomId, playerId } = (await req.json()) as { roomId?: string; playerId?: string }
    if (!roomId || !playerId) return badRequest('Missing roomId or playerId')

    const result = await mutateGameStorage(roomId, (storage) => {
      assertGamePhase(storage, 'playing')
      assertIsActivePlayer(storage, playerId)
      if (storage.hasRolled) throw new Error('You have already rolled this turn')
      
      const player = storage.players[storage.currentPlayerIndex]
      const dice = rollDice()
      const isDoubles = dice[0] === dice[1]
      storage.lastRollWasDoubles = isDoubles
      storage.lastDiceRoll = { d1: dice[0], d2: dice[1], timestamp: Date.now() }
      storage.hasRolled = true

      const total = dice[0] + dice[1]
      const nextPosition = (player.position + total) % 40
      const passedGo = nextPosition < player.position
      player.position = nextPosition
      if (passedGo) player.cash += 200
      if (nextPosition === 30) {
        storage.lastRollWasDoubles = false
      }
      storage.gamePhase = 'landed'
      addLog(storage, `${player.username} rolled ${dice[0]} and ${dice[1]}.`)
      return { dice, newPosition: player.position, passedGo }
    })

    await broadcastRoomEvent(roomId, { type: 'DICE_ROLLED', playerId, dice: result.dice })
    return NextResponse.json(result)
  } catch (error) {
    return routeError(error, 'Roll failed')
  }
}
