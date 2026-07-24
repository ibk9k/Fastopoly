import { Liveblocks } from '@liveblocks/node'
import { NextRequest, NextResponse } from 'next/server'
import { getRequestUser, supabaseAdmin } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const { room } = (await req.json()) as { room?: string }

    if (!room) {
      return NextResponse.json({ error: 'Missing room' }, { status: 400 })
    }

    const secret = process.env.LIVEBLOCKS_SECRET_KEY
    if (!secret) {
      return NextResponse.json({ error: 'LIVEBLOCKS_SECRET_KEY is not configured' }, { status: 500 })
    }

    // Identity comes from the session cookie, never the request body. Previously any
    // caller could mint a session for any room under any username, which on a public
    // deployment meant strangers could read game state and write presence (appearing
    // in the player list, toggling ready, skewing the auto-roll election).
    const user = await getRequestUser()
    if (!user) {
      return NextResponse.json({ error: 'Sign in (or play as guest) to join a room' }, { status: 401 })
    }

    // Only grant access to Fastopoly rooms (don't act as a generic Liveblocks token service).
    if (!room.startsWith('fastopoly-')) {
      return NextResponse.json({ error: 'Unknown room' }, { status: 403 })
    }

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('username')
      .eq('id', user.id)
      .maybeSingle()

    const liveblocks = new Liveblocks({ secret })
    const session = liveblocks.prepareSession(`user-${user.id}`, {
      userInfo: { username: profile?.username ?? 'Player' },
    })

    // READ_ACCESS = storage read + presence write. Clients read game state and update their
    // own presence (username/ready/turn), but can no longer write storage directly — all
    // mutations must go through the token-guarded /api/game/* routes (Phase 2B).
    session.allow(room, session.READ_ACCESS)

    const { body, status } = await session.authorize()
    return new Response(body, { status })
  } catch (error) {
    console.error('Liveblocks auth failed', error)
    return NextResponse.json({ error: 'Unable to authorize Liveblocks session' }, { status: 500 })
  }
}
