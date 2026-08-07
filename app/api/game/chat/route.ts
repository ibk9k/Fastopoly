import { NextRequest, NextResponse } from 'next/server'
import { nanoid } from 'nanoid'
import type { ChatMessage } from '@/lib/liveblocks.config'
import { appendMessage, rejectionMessage, validateMessage } from '@/lib/game-engine/chat'
import { badRequest, routeError } from '@/lib/game-engine/route-utils'
import { mutateGameStorage } from '@/lib/game-engine/server-state'
import { getRequestUser, supabaseAdmin } from '@/lib/supabase/server'

/**
 * Player chat, available in the lobby and in game.
 *
 * Authenticated by the **Supabase session**, not by a seat token, because the lobby
 * has no seats — `storage.players` stays empty until `init` freezes them, so a seat
 * token cannot exist yet for the phase where people most need to talk.
 *
 * The author is always derived from the session cookie. The body carries only the
 * room and the text; a username in the body would let anyone speak as anyone.
 */
export async function POST(req: NextRequest) {
  try {
    const { roomId, text } = (await req.json()) as { roomId?: string; text?: string }
    if (!roomId || typeof text !== 'string') return badRequest('Missing roomId or text')

    const user = await getRequestUser()
    if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

    // Fallback display name for someone chatting before seats exist.
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('username')
      .eq('id', user.id)
      .maybeSingle()

    let rejection: string | null = null

    await mutateGameStorage(roomId, (storage) => {
      const existing = storage.messages ?? []
      const verdict = validateMessage(text, user.id, existing, Date.now())
      if (!verdict.ok) {
        rejection = rejectionMessage(verdict.reason)
        return { skipWrite: true }
      }

      // Prefer the seat's identity so chat matches the board — same name, same
      // colour swatch. Falls back to the profile in the lobby.
      const seat = storage.players.find((player) => player.authUserId === user.id)

      const message: ChatMessage = {
        id: nanoid(),
        authorId: user.id,
        username: seat?.username ?? profile?.username ?? 'Player',
        color: seat?.color,
        text: verdict.text,
        timestamp: Date.now(),
      }

      storage.messages = appendMessage(existing, message)
    })

    if (rejection) return badRequest(rejection)
    return NextResponse.json({ success: true })
  } catch (error) {
    return routeError(error, 'Could not send message')
  }
}
