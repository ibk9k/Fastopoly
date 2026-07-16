import { NextRequest, NextResponse } from 'next/server'
import type { GameRules } from '@/lib/liveblocks.config'
import { authenticateHost, readPlayerToken } from '@/lib/game-engine/auth'
import { badRequest, routeError } from '@/lib/game-engine/route-utils'
import { mutateGameStorage } from '@/lib/game-engine/server-state'

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

    await mutateGameStorage(roomId, (storage) => {
      if (storage.gamePhase !== 'lobby') throw new Error('Settings can only be changed in the lobby')
      if (rulesPatch) storage.rules = { ...storage.rules, ...rulesPatch }
      if (typeof mapType === 'string') storage.mapType = mapType
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return routeError(error, 'Lobby settings update failed')
  }
}
