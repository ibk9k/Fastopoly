import { NextRequest, NextResponse } from 'next/server'
import { HOST_SUBJECT, signGameToken } from '@/lib/game-engine/auth'
import { seedLobbyStorage } from '@/lib/game-engine/server-state'
import type { GameRules } from '@/lib/liveblocks.config'
import { supabaseAdmin } from '@/lib/supabase/server'

type CreateLobbyBody = {
  roomCode?: string
  username?: string
  mapType?: string
  rules?: Partial<GameRules>
  isPublic?: boolean
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as CreateLobbyBody
    if (!body.roomCode || !body.username || !body.mapType || !body.rules) {
      return NextResponse.json({ error: 'Missing required lobby fields' }, { status: 400 })
    }

    const { error } = await supabaseAdmin.from('public_rooms').insert({
      id: body.roomCode,
      host_username: body.username,
      map_type: body.mapType,
      player_count: 1,
      max_players: body.rules.maxPlayers ?? 4,
      rules: body.rules,
      status: body.isPublic ? 'waiting' : 'private',
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Best-effort cleanup of rooms that have sat unused in the waiting list for hours.
    try {
      const staleCutoff = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()
      await supabaseAdmin.from('public_rooms').delete().eq('status', 'waiting').lt('last_active_at', staleCutoff)
    } catch {
      // Non-fatal — cleanup is opportunistic.
    }

    // Seed the Liveblocks storage server-side so clients don't need write access to bootstrap it.
    const rules: GameRules = {
      startingCash: body.rules?.startingCash ?? 1500,
      freeParkingJackpot: body.rules?.freeParkingJackpot ?? false,
      auctionOnPass: body.rules?.auctionOnPass ?? true,
      speedDie: body.rules?.speedDie ?? false,
      maxPlayers: body.rules?.maxPlayers ?? 4,
    }
    await seedLobbyStorage(body.roomCode, rules, body.mapType)

    // Issue the host token to the creator only. It gates host-only routes (init, end).
    const hostToken = signGameToken(body.roomCode, HOST_SUBJECT)
    return NextResponse.json({ roomCode: body.roomCode, hostToken })
  } catch (error) {
    console.error('Create lobby failed', error)
    return NextResponse.json({ error: 'Unable to create room' }, { status: 500 })
  }
}
