'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { MAX_MESSAGE_LENGTH } from '@/lib/game-engine/chat'
import { postJson } from '@/components/game/helpers'
import { useStorage } from '@/lib/liveblocks.config'
import { useToast } from '@/components/ui/Toast'

function clockTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

/**
 * Room chat, for the lobby and mid-game.
 *
 * Reads straight from storage like every other panel, so history survives a reload
 * and a player who joins late sees what was said. Sending goes through
 * /api/game/chat, which derives the author from the session cookie.
 */
export default function ChatPanel({ roomId }: { roomId: string }) {
  const stored = useStorage((root) => root.messages)
  const messages = useMemo(() => stored ?? [], [stored])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const endRef = useRef<HTMLDivElement | null>(null)
  const { toast } = useToast()

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length])

  async function send() {
    const text = draft.trim()
    if (!text || sending) return
    setSending(true)
    // Cleared optimistically: the message round-trips through storage, and leaving
    // the box full while that happens invites double-sends.
    setDraft('')
    try {
      await postJson('/api/game/chat', { roomId, text })
    } catch (error) {
      setDraft(text)
      toast(error instanceof Error ? error.message : 'Could not send message', 'error')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* min-h-0 lets this shrink below its content so the scrollbar appears here
        * rather than the whole panel growing. */}
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="grid gap-2.5">
          {messages.length === 0 ? (
            <p className="text-sm text-zinc-600">No messages yet. Say hello.</p>
          ) : null}
          {messages.map((message) => (
            <div key={message.id} className="text-sm">
              <div className="flex items-baseline gap-1.5">
                {message.color ? (
                  <span
                    aria-hidden
                    className="h-2 w-2 flex-shrink-0 rounded-full"
                    style={{ backgroundColor: message.color }}
                  />
                ) : null}
                <span className="font-extrabold text-zinc-900">{message.username}</span>
                <span className="text-[10px] uppercase tracking-[0.14em] text-zinc-600">
                  {clockTime(message.timestamp)}
                </span>
              </div>
              <p className="break-words text-zinc-800">{message.text}</p>
            </div>
          ))}
          <div ref={endRef} />
        </div>
      </div>

      <form
        // shrink-0 is load-bearing: without it the composer is a flex child that
        // gives up its height as the message list grows, and the input silently
        // vanishes off the bottom of the panel once the conversation gets long.
        className="mt-3 flex shrink-0 items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          void send()
        }}
      >
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value.slice(0, MAX_MESSAGE_LENGTH))}
          maxLength={MAX_MESSAGE_LENGTH}
          placeholder="Message…"
          aria-label="Chat message"
          className="min-w-0 flex-1 rounded-md border border-salmon-line/50 bg-parchment-raised px-3 py-2 text-sm font-semibold text-zinc-900 outline-none transition-colors focus:border-pine"
        />
        <button
          type="submit"
          disabled={!draft.trim() || sending}
          className="rounded-md bg-pine px-3 py-2 text-xs font-black uppercase tracking-wide text-felt transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </div>
  )
}
