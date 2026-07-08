import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const { roomCode } = (await req.json()) as { roomCode?: string }
    if (!roomCode) {
      return NextResponse.json({ valid: false, error: 'Missing room code' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('public_rooms')
      .select('id')
      .eq('id', roomCode)
      .eq('status', 'waiting')
      .maybeSingle()

    if (error) {
      return NextResponse.json({ valid: false, error: error.message }, { status: 500 })
    }

    if (!data) {
      return NextResponse.json({ valid: false, error: 'Room not found or already started' }, { status: 404 })
    }

    return NextResponse.json({ valid: true })
  } catch (error) {
    console.error('Validate lobby failed', error)
    return NextResponse.json({ valid: false, error: 'Unable to validate room' }, { status: 500 })
  }
}
