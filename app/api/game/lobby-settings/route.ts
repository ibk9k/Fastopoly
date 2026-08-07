import { NextRequest, NextResponse } from 'next/server'
import type { GameRules } from '@/lib/liveblocks.config'
import { authenticateHost, readPlayerToken } from '@/lib/game-engine/auth'
import { badRequest, routeError } from '@/lib/game-engine/route-utils'
import { mutateGameStorage } from '@/lib/game-engine/server-state'
import { supabaseAdmin } from '@/lib/supabase/server'

/**
 * Host-only lobby settings updates. Replaces the client-side storage writes that
 * READ_ACCESS forbids (Phase 2B). Only applies while the room is still in the lobby.
 */
export async function POST(req: NextRequest) {
  try {
    const { roomId, rulesPatch, mapType } = (await req.json()) as {
      roomId?: string
      rulesPatch?: Partial<GameRules>
      mapType?: string
    }
    if (!roomId) return badRequest('Missing roomId')
    authenticateHost(roomId, readPlayerToken(req))

    // Returns the merged result, not the patch: the Supabase mirror below has to
    // store the whole rule set, and writing the patch alone would drop the rest.
    const applied = await mutateGameStorage(roomId, (storage) => {
      if (storage.gamePhase !== 'lobby') throw new Error('Settings can only be changed in the lobby')
      if (rulesPatch) storage.rules = { ...storage.rules, ...rulesPatch }
      if (typeof mapType === 'string') storage.mapType = mapType
      return { rules: storage.rules, mapType: storage.mapType }
    })

    // The public games list reads capacity and map from Supabase, not from Liveblocks
    // storage. Without this the row keeps whatever was written at room creation, so a
    // host who lowers the cap to 3 still advertises "/ 4 players".
    //
    // Best-effort: the authoritative rules already landed in storage above, so a
    // failure here costs an out-of-date listing, not a broken game.
    await supabaseAdmin
      .from('public_rooms')
      .update({
        max_players: applied.rules.maxPlayers,
        map_type: applied.mapType,
        rules: applied.rules,
      })
      .eq('id', roomId)
      .then(undefined, () => undefined)

    return NextResponse.json({ success: true })
  } catch (error) {
    return routeError(error, 'Lobby settings update failed')
  }
}
