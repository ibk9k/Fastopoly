import { NextRequest, NextResponse } from 'next/server'
import { touchRoomActivity } from '@/lib/game-engine/room-cleanup'

export async function POST(req: NextRequest) {
  try {
    const { roomCode } = (await req.json()) as { roomCode?: string }
    if (!roomCode) {
      return NextResponse.json({ error: 'Missing roomCode' }, { status: 400 })
    }

    await touchRoomActivity(roomCode)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: 'Heartbeat failed' }, { status: 500 })
  }
}
