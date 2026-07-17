import { NextRequest, NextResponse } from 'next/server'
import { authenticatePlayer, readPlayerToken } from '@/lib/game-engine/auth'
import { assertGamePhase, assertIsActivePlayer } from '@/lib/game-engine/guards'
import { badRequest, rollDice, routeError } from '@/lib/game-engine/route-utils'
import { addLog, broadcastRoomEvent, endTurn, mutateGameStorage } from '@/lib/game-engine/server-state'
import { resolveCurrentTile } from '@/lib/game-engine/turn'
import { BOARD } from '@/lib/game-engine/board'
import type { RoomEvent } from '@/lib/liveblocks.config'

export async function POST(req: NextRequest) {
  try {
    const { roomId, playerId, action } = (await req.json()) as {
      roomId?: string
      playerId?: string
      action?: 'pay' | 'use_card' | 'roll'
    }
    if (!roomId || !playerId || !action) return badRequest('Missing jail fields')
    const token = readPlayerToken(req)

    const events: RoomEvent[] = []
    const result = await mutateGameStorage(roomId, (storage) => {
      const caller = authenticatePlayer(storage, roomId, playerId, token)
      assertGamePhase(storage, 'playing')
      assertIsActivePlayer(storage, caller.id)
      const player = storage.players[storage.currentPlayerIndex]
      if (!player.inJail) throw new Error('Player is not in jail')

      if (action === 'pay') {
        if (player.cash < 50) throw new Error('Not enough cash to pay the jail fine')
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

      if (storage.hasRolled) throw new Error('You have already rolled this turn')

      const dice = rollDice()
      const total = dice[0] + dice[1]
      storage.lastDiceRoll = { d1: dice[0], d2: dice[1], timestamp: Date.now() }
      storage.hasRolled = true
      // A jail-escape roll never grants a doubles re-roll.
      storage.lastRollWasDoubles = false
      storage.consecutiveDoubles = 0

      if (dice[0] === dice[1]) {
        // Doubles: leave jail AND move by the roll, resolving the landing.
        player.inJail = false
        player.jailTurns = 0
        player.position = (player.position + total) % BOARD.length
        addLog(storage, `${player.username} rolled doubles (${dice[0]}s) and left jail.`)
        const landing = resolveCurrentTile(storage, player, total, events)
        return { success: true, dice, canRoll: false, action: landing.action }
      }

      player.jailTurns += 1
      if (player.jailTurns >= 3) {
        // Third failed attempt: pay the fine and move by this roll.
        if (player.cash < 50) {
          // Can't cover the fine — they leave jail in debt and must liquidate or go bankrupt.
          addLog(storage, `${player.username} owes the $50 jail fine and must raise funds.`)
        }
        player.cash -= 50
        player.inJail = false
        player.jailTurns = 0
        player.position = (player.position + total) % BOARD.length
        addLog(storage, `${player.username} paid $50 after three failed jail rolls and moved on.`)
        const landing = resolveCurrentTile(storage, player, total, events)
        return { success: true, dice, canRoll: false, action: landing.action }
      }

      addLog(storage, `${player.username} failed to roll doubles (${dice[0]} and ${dice[1]}).`)
      endTurn(storage)
      return { success: true, dice, canRoll: false }
    })

    const rolledDice = (result as { dice?: [number, number] }).dice
    if (rolledDice) {
      await broadcastRoomEvent(roomId, { type: 'DICE_ROLLED', playerId, dice: rolledDice })
    }
    await Promise.all(events.map((event) => broadcastRoomEvent(roomId, event)))
    return NextResponse.json(result)
  } catch (error) {
    return routeError(error, 'Jail action failed')
  }
}
