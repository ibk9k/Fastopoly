'use client'

import { useEffect, useState } from 'react'
import { useEventListener, useStorage } from '@/lib/liveblocks.config'

type BankruptcyNotice = {
  playerId: string
  createdAt: number
}

export default function BankruptcyOverlay() {
  const players = useStorage((root) => root.players) ?? []
  const [notice, setNotice] = useState<BankruptcyNotice | null>(null)

  useEventListener(({ event }) => {
    if (event.type !== 'PLAYER_BANKRUPT') return
    setNotice({ playerId: event.playerId, createdAt: Date.now() })
  })

  useEffect(() => {
    if (!notice) return
    const timeoutId = window.setTimeout(() => setNotice(null), 4500)
    return () => window.clearTimeout(timeoutId)
  }, [notice])

  if (!notice) return null

  const player = players.find((candidate) => candidate.id === notice.playerId)

  return (
    <div className="fixed left-0 right-0 top-12 z-toast px-4">
      <div
        className="mx-auto max-w-4xl rounded-md border-2 bg-[#F7F0E4]/95 px-5 py-3 text-center font-black text-zinc-900 shadow-2xl transition-opacity"
        style={{ borderColor: player?.color ?? '#d28b7a' }}
      >
        <span className="mr-2 inline-block h-3 w-3 rounded-full border border-black/10" style={{ backgroundColor: player?.color ?? '#d28b7a' }} />
        {player?.username ?? 'A player'} went bankrupt!
      </div>
    </div>
  )
}
