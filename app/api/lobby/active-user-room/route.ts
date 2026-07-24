import { NextRequest, NextResponse } from 'next/server'
import { findActiveUserRoom } from '@/lib/game-engine/room-cleanup'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const username = searchParams.get('username')
    if (!username) {
      return NextResponse.json({ activeRoomId: null })
    }

    const activeRoomId = await findActiveUserRoom(username)
    return NextResponse.json({ activeRoomId })
  } catch (error) {
    console.error('Check active user room error:', error)
    return NextResponse.json({ activeRoomId: null })
  }
}
