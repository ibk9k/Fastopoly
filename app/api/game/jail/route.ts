import { NextRequest, NextResponse } from 'next/server'
import { authenticatePlayer, readPlayerToken } from '@/lib/game-engine/auth'
import { assertGamePhase, assertIsActivePlayer } from '@/lib/game-engine/guards'
import { badRequest, rollDice, routeError } from '@/lib/game-engine/route-utils'
import { addLog, endTurn, mutateGameStorage } from '@/lib/game-engine/server-state'

export async function POST(req: NextRequest) {
  try {
    const { roomId, playerId, action } = (await req.json()) as {
      roomId?: string
      playerId?: string
      action?: 'pay' | 'use_card' | 'roll'
    }
    if (!roomId || !playerId || !action) return badRequest('Missing jail fields')
    const token = readPlayerToken(req)

    const result = await mutateGameStorage(roomId, (storage) => {
      const caller = authenticatePlayer(storage, roomId, playerId, token)
      assertGamePhase(storage, 'playing')
      assertIsActivePlayer(storage, caller.id)
      const player = storage.players[storage.currentPlayerIndex]
      if (!player.inJail) throw new Error('Player is not in jail')

      if (action === 'pay') {
        player.cash -= 50
        player.inJail = false
        player.jailTurns = 0
        addLog(storage, `${player.username} paid $50 to leave jail.`)
        return { success: true, canRoll: true }
      }

      if (action === 'use_card') {
        if (player.getOutOfJailCards <= 0) throw new Error('No Get Out of Jail cards')
        player.getOutOfJailCards -= 1
        player.inJail = false
        player.jailTurns = 0
        addLog(storage, `${player.username} used a Get Out of Jail Free card.`)
        return { success: true, canRoll: true }
      }

      if (action === 'roll' && storage.hasRolled) throw new Error('You have already rolled this turn')

      const dice = rollDice()
      storage.lastDiceRoll = { d1: dice[0], d2: dice[1], timestamp: Date.now() }
      storage.hasRolled = true
      if (dice[0] === dice[1]) {
        player.inJail = false
        player.jailTurns = 0
        addLog(storage, `${player.username} rolled doubles and left jail.`)
        return { success: true, dice, canRoll: false }
      }

      player.jailTurns += 1
      if (player.jailTurns >= 3) {
        player.cash -= 50
        player.inJail = false
        player.jailTurns = 0
        addLog(storage, `${player.username} paid $50 after three failed jail rolls.`)
      } else {
        endTurn(storage)
      }
      return { success: true, dice, canRoll: false }
    })

    return NextResponse.json(result)
  } catch (error) {
    return routeError(error, 'Jail action failed')
  }
}
