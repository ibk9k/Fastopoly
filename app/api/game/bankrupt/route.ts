import { NextRequest, NextResponse } from 'next/server'
import { authenticatePlayer, readPlayerToken } from '@/lib/game-engine/auth'
import { assertIsActivePlayer } from '@/lib/game-engine/guards'
import { executeBankruptcy } from '@/lib/game-engine/bankruptcy'
import { inferCreditorId } from '@/lib/game-engine/turn'
import { badRequest, routeError } from '@/lib/game-engine/route-utils'
import { broadcastRoomEvent, endTurn, mutateGameStorage } from '@/lib/game-engine/server-state'

export async function POST(req: NextRequest) {
  try {
    const { roomId, playerId } = (await req.json()) as { roomId?: string; playerId?: string }
    if (!roomId) return badRequest('Missing roomId')
    if (!playerId) return badRequest('Missing playerId')
    const token = readPlayerToken(req)

    let creditorId: string | 'bank' = 'bank'
    await mutateGameStorage(roomId, (storage) => {
      // Auth makes this self-only; requiring the active turn keeps the endTurn() below correct.
      const player = authenticatePlayer(storage, roomId, playerId, token)
      assertIsActivePlayer(storage, player.id)
      if (player.isBankrupt) throw new Error('Player is already bankrupt')

      // A player in debt goes bankrupt to whoever they owe (the owner of the
      // tile they sit on); a voluntary bankruptcy goes to the bank.
      creditorId = player.cash < 0 ? inferCreditorId(storage, player) : 'bank'
      executeBankruptcy(storage, player, creditorId)
      endTurn(storage)
    })

    await broadcastRoomEvent(roomId, { type: 'PLAYER_BANKRUPT', playerId, creditorId })

    return NextResponse.json({ success: true })
  } catch (error) {
    return routeError(error, 'Bankruptcy failed')
  }
}
