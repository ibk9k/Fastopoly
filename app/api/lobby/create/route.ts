import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'

type CreateLobbyBody = {
  roomCode?: string
  username?: string
  mapType?: string
  rules?: { maxPlayers?: number }
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

    return NextResponse.json({ roomCode: body.roomCode })
  } catch (error) {
    console.error('Create lobby failed', error)
    return NextResponse.json({ error: 'Unable to create room' }, { status: 500 })
  }
}
