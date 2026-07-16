import { NextRequest, NextResponse } from 'next/server'
import { calculateScores } from '@/lib/game-engine/scoring'
import type { PlayerResult } from '@/lib/game-engine/scoring'
import { authenticateHost, readPlayerToken } from '@/lib/game-engine/auth'
import { badRequest, routeError } from '@/lib/game-engine/route-utils'
import { mutateGameStorage, propertyMap } from '@/lib/game-engine/server-state'
import { supabaseAdmin } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const { roomId } = (await req.json()) as { roomId?: string }
    if (!roomId) return badRequest('Missing roomId')
    authenticateHost(roomId, readPlayerToken(req))

    let results: PlayerResult[] = []
    await mutateGameStorage(roomId, (storage) => {
      results = calculateScores(storage.players, propertyMap(storage.properties))
      storage.gamePhase = 'ended'
      storage.winnerIds = results.filter((result) => result.placement === 1).map((result) => result.playerId)
    })

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

    return NextResponse.json({ results })
  } catch (error) {
    return routeError(error, 'End game failed')
  }
}
