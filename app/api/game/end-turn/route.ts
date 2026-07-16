import { NextRequest, NextResponse } from 'next/server'
import { calculateScores } from '@/lib/game-engine/scoring'
import type { Player, Property } from '@/lib/liveblocks.config'
import { authenticatePlayer, readPlayerToken } from '@/lib/game-engine/auth'
import { assertGamePhase, assertIsActivePlayer } from '@/lib/game-engine/guards'
import { badRequest, routeError } from '@/lib/game-engine/route-utils'
import { endTurn, mutateGameStorage, propertyMap } from '@/lib/game-engine/server-state'
import { supabaseAdmin } from '@/lib/supabase/server'

async function persistEndedGame(roomId: string, storagePlayers: Parameters<typeof calculateScores>[0], properties: Parameters<typeof calculateScores>[1]) {
  const results = calculateScores(storagePlayers, properties)
  await supabaseAdmin.from('game_results').insert(
    results.map((result) => ({
      game_id: roomId,
      user_id: result.playerId,
      placement: result.placement,
      points_earned: result.pointsEarned,
      bonuses: result.bonuses,
    })),
  )
  await Promise.all(
    results.map(async (result) => {
      const { data } = await supabaseAdmin
        .from('users')
        .select('total_points,games_played,wins')
        .eq('id', result.playerId)
        .maybeSingle()
      await supabaseAdmin
        .from('users')
        .update({
          total_points: (data?.total_points ?? 0) + result.pointsEarned,
          games_played: (data?.games_played ?? 0) + 1,
          wins: (data?.wins ?? 0) + (result.placement === 1 ? 1 : 0),
        })
        .eq('id', result.playerId)
    }),
  )
  await supabaseAdmin.from('public_rooms').update({ status: 'finished' }).eq('id', roomId)
}

export async function POST(req: NextRequest) {
  try {
    const { roomId, playerId } = (await req.json()) as { roomId?: string; playerId?: string }
    if (!roomId) return badRequest('Missing roomId')
    const token = readPlayerToken(req)

    let shouldPersist = false
    let players: Player[] = []
    let properties: Map<string, Property> = new Map()
    await mutateGameStorage(roomId, (storage) => {
      const caller = authenticatePlayer(storage, roomId, playerId, token)
      // 'playing' only: after rolling the phase is 'landed', so the landing must be
      // resolved (rent/card/tax) before the turn can end — this closes the skip-rent exploit.
      assertGamePhase(storage, 'playing')
      assertIsActivePlayer(storage, caller.id)
      const activePlayer = storage.players[storage.currentPlayerIndex]
      if (activePlayer && activePlayer.cash < 0 && !activePlayer.isBankrupt) {
        throw new Error('Cannot end turn while in debt. Mortgage properties or declare bankruptcy.')
      }
      endTurn(storage)
      if (storage.gamePhase === 'ended') {
        shouldPersist = true
        players = storage.players
        properties = propertyMap(storage.properties)
      }
    })

    if (shouldPersist) {
      await persistEndedGame(roomId, players, properties)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return routeError(error, 'End turn failed')
  }
}
