import { NextRequest, NextResponse } from 'next/server'
import type { GameRules, Player } from '@/lib/liveblocks.config'
import { authenticateHost, readPlayerToken } from '@/lib/game-engine/auth'
import { addLog, emptyStorage, initialProperties, initializeGameStorage, readGameStorage, refreshTurnDeadline, writeGameStorage } from '@/lib/game-engine/server-state'
import { badRequest, routeError } from '@/lib/game-engine/route-utils'
import { supabaseAdmin } from '@/lib/supabase/server'

type InitBody = {
  roomId?: string
  players?: Player[]
  rules?: GameRules
  mapType?: string
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as InitBody
    if (!body.roomId || !body.players || !body.rules) return badRequest('Missing game init fields')
    authenticateHost(body.roomId, readPlayerToken(req))

    // Refuse to clobber a game that has already left the lobby (reset/force-restart exploit).
    const existing = await readGameStorage(body.roomId).catch(() => null)
    if (existing && existing.gamePhase !== 'lobby') {
      throw new Error('Game has already started')
    }

    // Capacity backstop. `/api/lobby/validate` turns joiners away at a full lobby,
    // but that check reads Liveblocks presence, which is eventually consistent —
    // two people validating at once can both pass. This is the point where seats
    // become permanent, so it is the last place the cap can actually be enforced.
    // It rejects rather than truncating: silently dropping someone who is sitting
    // in the lobby watching the countdown is worse than telling the host why.
    const capacity = body.rules.maxPlayers
    if (typeof capacity === 'number' && body.players.length > capacity) {
      throw new Error(
        `This room seats ${capacity}, but ${body.players.length} players are in the lobby.`,
      )
    }

    const storage = emptyStorage(body.rules, body.mapType ?? 'classic')
    storage.gamePhase = 'playing'
    storage.players = body.players.map((player) => ({
      ...player,
      position: 0,
      cash: body.rules!.startingCash,
      properties: [],
      inJail: false,
      jailTurns: 0,
      isBankrupt: false,
      getOutOfJailCards: 0,
    }))
    storage.properties = initialProperties()
    // Randomize who goes first rather than always the host.
    storage.currentPlayerIndex = Math.floor(Math.random() * storage.players.length)
    refreshTurnDeadline(storage)
    addLog(storage, 'Game started!')
    const firstPlayer = storage.players[storage.currentPlayerIndex]
    if (firstPlayer) addLog(storage, `${firstPlayer.username} goes first.`)

    try {
      await initializeGameStorage(body.roomId, storage)
    } catch {
      await writeGameStorage(body.roomId, storage)
    }

    // Update room status in Supabase so it's not shown as waiting anymore
    await supabaseAdmin
      .from('public_rooms')
      .update({ status: 'playing', last_active_at: new Date().toISOString() })
      .eq('id', body.roomId)

    return NextResponse.json({ success: true })
  } catch (error) {
    return routeError(error, 'Game init failed')
  }
}
