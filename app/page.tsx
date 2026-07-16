'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { customAlphabet } from 'nanoid'
import { setStoredHostToken } from '@/lib/game-client/tokens'
import PropertyStrip from '@/components/ui/PropertyStrip'

const usernameKey = 'fastopoly_username'
const createCode = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 5)

export default function HomePage() {
  const router = useRouter()
  const [showPlayModal, setShowPlayModal] = useState(false)
  const [showNameModal, setShowNameModal] = useState(false)
  const [username, setUsername] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setUsername(localStorage.getItem(usernameKey) ?? '')
  }, [])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setShowPlayModal(false)
        setShowNameModal(false)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  function openPlay() {
    const savedUsername = localStorage.getItem(usernameKey)
    if (!savedUsername) {
      setShowNameModal(true)
      return
    }
    setShowPlayModal(true)
  }

  function confirmUsername() {
    const trimmed = username.trim()
    if (!trimmed) return
    localStorage.setItem(usernameKey, trimmed)
    sessionStorage.setItem(usernameKey, trimmed)
    setShowNameModal(false)
    setShowPlayModal(true)
  }

  async function createRoomAndRedirect() {
    const savedUsername = sessionStorage.getItem(usernameKey) ?? localStorage.getItem(usernameKey)
    if (!savedUsername) {
      setShowNameModal(true)
      return
    }

    const roomCode = createCode()
    const rules = {
      startingCash: 1500,
      freeParkingJackpot: false,
      auctionOnPass: true,
      speedDie: false,
      maxPlayers: 4,
    }

    setCreating(true)
    setError(null)

    // TODO: Abandoned lobby rooms accumulate in Supabase with no automatic cleanup.
    // We should implement a cron or cleanup job to prune rooms that are empty or inactive for more than a few hours.
    const response = await fetch('/api/lobby/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomCode, username: savedUsername, mapType: 'classic', rules, isPublic: true }),
    })
    const result = (await response.json()) as { roomCode?: string; hostToken?: string; error?: string }
    setCreating(false)

    if (!response.ok || !result.roomCode) {
      setError(result.error ?? 'Could not create room')
      return
    }

    if (result.hostToken) {
      setStoredHostToken(result.roomCode, result.hostToken)
    }

    sessionStorage.setItem('fastopoly_rules', JSON.stringify(rules))
    sessionStorage.setItem('fastopoly_mapType', 'classic')
    router.push(`/game/${result.roomCode}`)
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-[#F7F0E4] px-6 text-zinc-900 overflow-hidden font-sans">
      <PropertyStrip position="top" />

      <section className="flex w-full max-w-xl flex-col items-center text-center py-16 z-0">
        <h1 className="font-display text-6xl tracking-normal sm:text-7xl text-pine drop-shadow-sm uppercase">Fastopoly</h1>
        <p className="mt-4 text-lg font-bold text-[#2f4d20]/75">Play with friends, anywhere</p>
        
        {error ? <p className="mt-4 text-sm font-black text-rose-700">{error}</p> : null}
        
        <button
          onClick={openPlay}
          disabled={creating}
          className="mt-12 w-full max-w-xs rounded-xl bg-[#2f4d20] px-8 py-4 text-lg font-black uppercase tracking-wider text-[#BAED91] border-2 border-[#2f4d20] transition-all hover:bg-[#2f4d20]/95 active:scale-95 shadow-md shadow-[#2f4d20]/15 focus:outline-none disabled:opacity-50"
        >
          {creating ? 'Starting...' : 'Play'}
        </button>

        <Link
          href="/shop"
          className="mt-4 w-full max-w-xs rounded-xl border-2 border-[#2f4d20]/25 bg-white px-8 py-3 text-sm font-bold text-[#2f4d20] tracking-wide uppercase transition hover:border-[#2f4d20]/50 active:scale-95 shadow-sm text-center"
        >
          Shop
        </Link>
        
        <Link href="/leaderboard" className="mt-6 text-xs font-black uppercase tracking-wider text-[#2f4d20]/60 hover:text-[#2f4d20] transition-colors">
          Leaderboard
        </Link>
      </section>

      <PropertyStrip position="bottom" />

      {/* Light-themed Name Modal */}
      {showNameModal ? (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 px-6 z-50" onClick={() => setShowNameModal(false)}>
          <div className="w-full max-w-sm rounded-xl border-[3px] border-[#2f4d20] bg-[#fdfbf7] p-6 text-left shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <h2 className="text-xl font-black text-[#2f4d20] uppercase tracking-wide">Choose a username</h2>
            <p className="mt-1 text-xs font-bold text-zinc-500">Enter your name to host or join games.</p>
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') confirmUsername()
              }}
              className="mt-5 w-full rounded-lg border-2 border-[#2f4d20]/20 bg-[#F7F0E4]/30 px-4 py-3 font-bold text-[#2f4d20] placeholder-zinc-400 outline-none focus:border-[#2f4d20] transition-all"
              placeholder="Your name"
              maxLength={15}
              autoFocus
            />
            <button
              onClick={confirmUsername}
              className="mt-4 w-full rounded-lg bg-[#2f4d20] px-4 py-3 font-black uppercase tracking-wider text-[#BAED91] hover:bg-[#2f4d20]/90 active:scale-[0.98] transition-all shadow-sm"
            >
              Confirm
            </button>
          </div>
        </div>
      ) : null}

      {/* Light-themed Play Choice Modal */}
      {showPlayModal ? (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 px-6 z-50" onClick={() => setShowPlayModal(false)}>
          <div className="w-full max-w-sm rounded-xl border-[3px] border-[#2f4d20] bg-[#fdfbf7] p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <h2 className="text-left text-xl font-black text-[#2f4d20] uppercase tracking-wide">Play Fastopoly</h2>
            <div className="mt-5 grid gap-3.5">
              <button
                onClick={createRoomAndRedirect}
                className="rounded-lg bg-[#2f4d20] px-4 py-3 font-black uppercase tracking-wider text-[#BAED91] hover:bg-[#2f4d20]/90 active:scale-[0.98] transition-all shadow-sm"
              >
                Host a game
              </button>
              <button
                onClick={() => router.push('/lobby/join')}
                className="rounded-lg border-2 border-[#2f4d20]/25 bg-white px-4 py-3 font-bold text-[#2f4d20] hover:border-[#2f4d20]/50 active:scale-[0.98] transition-all shadow-sm uppercase tracking-wide text-sm"
              >
                Join a game
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}
