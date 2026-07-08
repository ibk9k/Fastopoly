import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const { roomCode, isPublic } = (await req.json()) as { roomCode?: string; isPublic?: boolean }
    if (!roomCode || typeof isPublic !== 'boolean') {
      return NextResponse.json({ error: 'Missing room code or visibility' }, { status: 400 })
    }

    const { error } = await supabaseAdmin
      .from('public_rooms')
      .update({ status: isPublic ? 'waiting' : 'private' })
      .eq('id', roomCode)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Update visibility failed', error)
    return NextResponse.json({ error: 'Unable to update visibility' }, { status: 500 })
  }
}
