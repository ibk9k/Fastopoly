import { Liveblocks } from '@liveblocks/node'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { room, username } = (await req.json()) as { room?: string; username?: string }

    if (!room || !username) {
      return NextResponse.json({ error: 'Missing room or username' }, { status: 400 })
    }

    const secret = process.env.LIVEBLOCKS_SECRET_KEY
    if (!secret) {
      return NextResponse.json({ error: 'LIVEBLOCKS_SECRET_KEY is not configured' }, { status: 500 })
    }

    // Only grant access to Fastopoly rooms (don't act as a generic Liveblocks token service).
    if (!room.startsWith('fastopoly-')) {
      return NextResponse.json({ error: 'Unknown room' }, { status: 403 })
    }

    const liveblocks = new Liveblocks({ secret })
    const session = liveblocks.prepareSession(`user-${username}`, {
      userInfo: { username },
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
