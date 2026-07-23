import { NextResponse } from 'next/server'
import { cleanupInactiveRooms, INACTIVITY_THRESHOLD_MS } from '@/lib/game-engine/room-cleanup'
import { supabaseAdmin } from '@/lib/supabase/server'

/**
 * This handler takes no request input, so Next would otherwise statically
 * prerender it at build time and serve a frozen room list forever in production.
 */
export const dynamic = 'force-dynamic'

let lastCleanupTime = 0
const CLEANUP_THROTTLE_MS = 30_000

export async function GET() {
  try {
    const now = Date.now()

    // 1. Sweep inactive rooms at most once every 30s to keep list requests lightweight
    if (now - lastCleanupTime > CLEANUP_THROTTLE_MS) {
      lastCleanupTime = now
      void cleanupInactiveRooms(INACTIVITY_THRESHOLD_MS).catch(() => undefined)
    }

    // 2. Query remaining active public rooms waiting for players
    const cutoffTime = new Date(now - INACTIVITY_THRESHOLD_MS).toISOString()
    const { data: rooms, error } = await supabaseAdmin
      .from('public_rooms')
      .select('id,host_username,map_type,player_count,max_players')
      .eq('status', 'waiting')
      .gte('last_active_at', cutoffTime)
      .order('last_active_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ rooms: rooms ?? [] })
  } catch (error) {
    console.error('List public rooms failed', error)
    return NextResponse.json({ error: 'Unable to list public rooms' }, { status: 500 })
  }
}
