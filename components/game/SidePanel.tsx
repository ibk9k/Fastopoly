'use client'

import { useEffect, useRef, useState } from 'react'
import ChatPanel from '@/components/game/ChatPanel'
import GameLog from '@/components/game/GameLog'
import { useStorage } from '@/lib/liveblocks.config'

type SideTab = 'chat' | 'log'

const STORAGE_KEY = 'fastopoly-side-tab'

/**
 * Comments and Logs sharing one panel, one at a time.
 *
 * Both in view at once made the rail a wall of text, so this is a segmented switch
 * instead. The cost of hiding one is that activity in it goes unseen, so the
 * inactive tab carries an unread dot.
 */
export default function SidePanel({
  roomId,
  className = '',
}: {
  roomId: string
  className?: string
}) {
  const [tab, setTab] = useState<SideTab>('chat')
  const messageCount = useStorage((root) => root.messages)?.length ?? 0
  const logCount = useStorage((root) => root.log)?.length ?? 0

  // Restore the last choice. Read in an effect rather than in useState so the
  // server and first client render agree.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY)
      if (saved === 'chat' || saved === 'log') setTab(saved)
    } catch {
      // Storage unavailable — the default is fine.
    }
  }, [])

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, tab)
    } catch {
      // Ignore.
    }
  }, [tab])

  // Unread = counts that grew while the tab was hidden. Seeded on mount so opening
  // the panel doesn't immediately show a dot for history.
  const seen = useRef<{ chat: number; log: number } | null>(null)
  const [unread, setUnread] = useState({ chat: false, log: false })

  useEffect(() => {
    if (seen.current === null) {
      seen.current = { chat: messageCount, log: logCount }
      return
    }
    const previous = seen.current
    seen.current = { chat: messageCount, log: logCount }
    setUnread((current) => ({
      chat: tab === 'chat' ? false : current.chat || messageCount > previous.chat,
      log: tab === 'log' ? false : current.log || logCount > previous.log,
    }))
  }, [messageCount, logCount, tab])

  useEffect(() => {
    setUnread((current) => ({ ...current, [tab]: false }))
  }, [tab])

  return (
    // The height is fixed by the caller, never by the content. An auto-height panel
    // grew with every message until the composer was pushed out of view, and it
    // shifted the whole rail each time someone spoke.
    <section
      className={`flex min-h-0 flex-col rounded-lg border border-salmon-line/60 bg-salmon p-3 shadow-card ${className}`}
    >
      <div
        role="tablist"
        aria-label="Comments and logs"
        className="grid grid-cols-2 gap-1 rounded-md bg-parchment-raised/50 p-1"
      >
        {(
          [
            ['chat', 'Comments'],
            ['log', 'Logs'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={`relative rounded px-3 py-1.5 text-xs font-black uppercase tracking-wide transition-all ${
              tab === value ? 'bg-pine text-felt shadow-sm' : 'text-zinc-800 hover:text-zinc-950'
            }`}
          >
            {label}
            {unread[value] && tab !== value ? (
              <span
                aria-label="New activity"
                className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-danger"
              />
            ) : null}
          </button>
        ))}
      </div>

      <div className="mt-3 min-h-0 flex-1 overflow-hidden">
        {tab === 'chat' ? <ChatPanel roomId={roomId} /> : <GameLog bare />}
      </div>

      {/* Both tabs render into the same fixed frame, so switching between them does
        * not resize the panel or move anything below it. */}
    </section>
  )
}
