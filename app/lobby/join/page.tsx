'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'

type PublicRoom = {
  id: string
  host_username: string
  map_type: string
  player_count: number
  max_players: number
}

export default function JoinLobbyPage() {
  const router = useRouter()
  const [roomCode, setRoomCode] = useState('')
  const [rooms, setRooms] = useState<PublicRoom[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loadingRooms, setLoadingRooms] = useState(true)

  const fetchRooms = useCallback(async () => {
    const { data } = await supabase
      .from('public_rooms')
      .select('id,host_username,map_type,player_count,max_players')
      .eq('status', 'waiting')
      .order('created_at', { ascending: false })
    setRooms(data ?? [])
    setLoadingRooms(false)
  }, [])

  useEffect(() => {
    void fetchRooms()
    const interval = window.setInterval(() => void fetchRooms(), 5000)
    return () => window.clearInterval(interval)
  }, [fetchRooms])

  async function joinByCode(code = roomCode) {
    const normalized = code.trim().toUpperCase()
    if (normalized.length !== 5) {
      setError('Enter a 5-character room code')
      return
    }

    const response = await fetch('/api/lobby/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomCode: normalized }),
    })
    const result = (await response.json()) as { valid?: boolean; error?: string }
    if (!response.ok || !result.valid) {
      setError(result.error ?? 'Room not found')
      return
    }
    router.push(`/game/${normalized}`)
  }

  return (
    <main className="min-h-screen bg-[#F7F0E4] px-6 py-10 text-zinc-900 font-sans">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-4xl font-black uppercase text-[#2f4d20] tracking-wide">Join a game</h1>
        
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          {/* Party Code Panel */}
          <section className="rounded-lg border border-[#e58a74]/40 bg-[#EFA38F] p-6 shadow-xl">
            <h2 className="text-lg font-black text-zinc-900 uppercase tracking-wide">Enter party code</h2>
            <p className="mt-1 text-xs font-bold text-zinc-700">Enter a 5-letter code to join a private room.</p>
            
            <input
              value={roomCode}
              onChange={(event) => setRoomCode(event.target.value.toUpperCase().slice(0, 5))}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void joinByCode()
              }}
              className="mt-5 w-full rounded-lg border border-[#e58a74]/40 bg-[#fdfbf7] px-4 py-3 text-xl font-bold uppercase tracking-[0.25em] text-[#2f4d20] outline-none focus:border-[#2f4d20] transition-all"
              maxLength={5}
              placeholder="ABCDE"
            />
            {error ? <p className="mt-3 text-xs font-black text-rose-900">{error}</p> : null}
            
            <button
              onClick={() => void joinByCode()}
              className="mt-5 w-full rounded-lg bg-[#2f4d20] px-4 py-3 font-black text-[#BAED91] hover:bg-[#2f4d20]/90 transition-transform active:scale-[0.98] uppercase tracking-wider"
            >
              Join Room
            </button>
          </section>

          {/* Public Games Panel */}
          <section className="rounded-lg border border-[#e58a74]/40 bg-[#EFA38F] p-6 shadow-xl">
            <h2 className="text-lg font-black text-zinc-900 uppercase tracking-wide">Public games</h2>
            <p className="mt-1 text-xs font-bold text-zinc-700">Browse and join active lobbies.</p>
            
            <div className="mt-5 grid gap-3">
              {loadingRooms
                ? [0, 1, 2].map((i) => (
                    <div
                      key={`skeleton-${i}`}
                      className="h-[58px] animate-pulse rounded-lg border border-[#e58a74]/30 bg-white/20"
                    />
                  ))
                : null}
              {!loadingRooms &&
                rooms.map((room) => (
                <div key={room.id} className="flex items-center justify-between gap-4 rounded-lg border border-[#e58a74]/30 bg-white/20 px-4 py-3 shadow-sm">
                  <div>
                    <p className="font-black text-zinc-900 text-sm capitalize">{room.host_username}</p>
                    <p className="text-[11px] font-bold text-zinc-700 uppercase tracking-wide mt-0.5">
                      {room.map_type} · {room.player_count} / {room.max_players} players
                    </p>
                  </div>
                  <button
                    onClick={() => router.push(`/game/${room.id}`)}
                    className="rounded-md border border-[#2f4d20]/30 bg-white/40 hover:bg-white/60 px-4 py-2 text-xs font-black text-[#2f4d20] transition-all active:scale-95"
                  >
                    Join
                  </button>
                </div>
              ))}
              {!loadingRooms && rooms.length === 0 ? (
                <p className="rounded-lg border border-[#e58a74]/30 bg-white/10 px-4 py-6 text-center text-xs font-bold text-zinc-700">
                  No public games waiting.
                </p>
              ) : null}
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}
