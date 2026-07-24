'use client'

import { LiveList } from '@liveblocks/client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { GameRules } from '@/lib/liveblocks.config'
import { RoomProvider } from '@/lib/liveblocks.config'
import { useTurnSync } from '@/hooks/useTurnSync'
import { useAuth } from '@/components/auth/AuthProvider'

function TurnPresenceSync() {
  useTurnSync()
  return null
}

const DEFAULT_RULES: GameRules = { startingCash: 1500, freeParkingJackpot: false, auctionOnPass: true, speedDie: false, maxPlayers: 4 }

export default function Room({ roomId, children }: { roomId: string; children: React.ReactNode }) {
  const { user, profile, ready, signInAsGuest } = useAuth()
  const [username, setUsername] = useState<string | null>(null)
  const [needsName, setNeedsName] = useState(false)
  const [inputName, setInputName] = useState('')
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState<string | null>(null)

  const [validating, setValidating] = useState(true)
  const [validationError, setValidationError] = useState<string | null>(null)

  const savedRules = useMemo<GameRules>(() => {
    try {
      const raw = sessionStorage.getItem('fastopoly_rules')
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<GameRules>
        return { ...DEFAULT_RULES, ...parsed }
      }
    } catch { /* ignore */ }
    return DEFAULT_RULES
  }, [])

  const savedMapType = useMemo(() => {
    try {
      return sessionStorage.getItem('fastopoly_mapType') ?? 'classic'
    } catch { return 'classic' }
  }, [])

  const hasValidatedRef = useRef(false)

  const validateAndSetUsername = useCallback(
    async (targetUsername: string) => {
      setValidating(true)
      setValidationError(null)
      try {
        const res = await fetch('/api/lobby/validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomCode: roomId, username: targetUsername }),
        })
        const data = (await res.json()) as { valid?: boolean; error?: string }
        if (!res.ok || !data.valid) {
          setValidationError(data.error ?? 'Could not join room')
          setValidating(false)
          hasValidatedRef.current = false
          return false
        }
        setUsername(targetUsername)
        setNeedsName(false)
        setValidating(false)
        hasValidatedRef.current = true
        return true
      } catch {
        setValidationError('Unable to validate room connection')
        setValidating(false)
        hasValidatedRef.current = false
        return false
      }
    },
    [roomId],
  )

  // Validate room membership ONCE on entry. Subsequent window focus / Alt-Tabs
  // update profile state in background without unmounting RoomProvider or flashing the spinner.
  useEffect(() => {
    if (!ready) return
    if (hasValidatedRef.current || username) {
      setValidating(false)
      return
    }

    if (user && profile?.username) {
      hasValidatedRef.current = true
      void validateAndSetUsername(profile.username)
      return
    }
    setValidating(false)
    setNeedsName(true)
  }, [ready, user, profile?.username, username, validateAndSetUsername])

  const handleConfirmName = useCallback(async () => {
    const trimmed = inputName.trim()
    if (!trimmed) return
    setJoining(true)
    setJoinError(null)

    const isValid = await validateAndSetUsername(trimmed)
    if (!isValid) {
      setJoining(false)
      return
    }

    const { error } = await signInAsGuest(trimmed)
    setJoining(false)
    if (error) {
      setJoinError(error)
      return
    }
    sessionStorage.setItem('fastopoly_username', trimmed)
    localStorage.setItem('fastopoly_username', trimmed)
  }, [inputName, signInAsGuest, validateAndSetUsername])

  if (validationError) {
    return (
      <div className="min-h-screen bg-[#F7F0E4] p-8 text-zinc-900 flex items-center justify-center font-sans">
        <div className="w-full max-w-md rounded-2xl border-[3px] border-danger/60 bg-white p-6 shadow-2xl text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-danger/10 text-danger text-2xl font-black">
            !
          </div>
          <h2 className="text-2xl font-black tracking-wider text-zinc-900 uppercase">Cannot Join Game</h2>
          <p className="mt-3 text-sm font-bold text-zinc-700 leading-relaxed">{validationError}</p>
          <div className="mt-6 flex flex-col gap-2.5">
            <a
              href="/lobby/join"
              className="w-full rounded-lg bg-pine px-4 py-3 font-black text-felt hover:bg-pine/90 transition-transform active:scale-[0.98] inline-block text-center"
            >
              Browse Games
            </a>
            <a
              href="/"
              className="w-full rounded-lg border-2 border-zinc-300 bg-zinc-100 px-4 py-2.5 font-extrabold text-zinc-700 hover:bg-zinc-200 transition-transform active:scale-[0.98] inline-block text-center text-xs"
            >
              Back to Home
            </a>
          </div>
        </div>
      </div>
    )
  }

  if (needsName) {
    return (
      <div className="min-h-screen bg-[#F7F0E4] p-8 text-zinc-900 flex items-center justify-center font-sans">
        <div className="w-full max-w-sm rounded-2xl border-[3px] border-[#2f4d20] bg-[#BAED91] p-6 shadow-2xl text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/Logo.png" alt="Fastopoly" width={951} height={393} className="mx-auto h-auto w-56 max-w-full" />
          <p className="mt-3 text-sm font-bold text-[#2f4d20]/80">Enter a username to join the game room.</p>
          <input
            value={inputName}
            onChange={(e) => setInputName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleConfirmName()
            }}
            className="mt-6 w-full rounded-lg border-2 border-[#2f4d20]/45 bg-[#fcfaf2] px-4 py-3 text-zinc-900 font-bold placeholder-zinc-400 outline-none focus:border-[#2f4d20]"
            placeholder="Username"
            maxLength={15}
            autoFocus
          />
          {joinError ? <p className="mt-3 text-sm font-bold text-danger">{joinError}</p> : null}
          <button
            onClick={() => void handleConfirmName()}
            disabled={joining}
            className="mt-4 w-full rounded-lg bg-[#2f4d20] px-4 py-3 font-black text-[#BAED91] hover:bg-[#2f4d20]/90 transition-transform active:scale-[0.98] disabled:opacity-50"
          >
            {joining ? 'Joining…' : 'Join Game'}
          </button>
        </div>
      </div>
    )
  }

  if (validating || !username) {
    return (
      <div className="min-h-screen bg-[#F7F0E4] p-8 text-[#2f4d20] flex flex-col items-center justify-center gap-4 font-sans">
        <div
          className="h-10 w-10 animate-spin rounded-full border-4 border-[#2f4d20]/25 border-t-[#2f4d20]"
          role="status"
          aria-label="Loading room"
        />
        <p className="text-sm font-bold uppercase tracking-wider">Loading room…</p>
      </div>
    )
  }

  return (
    <RoomProvider
      id={`fastopoly-${roomId}`}
      initialPresence={{ username, currentTile: 0, isMyTurn: false, isReady: false }}
      initialStorage={{
        gamePhase: 'lobby',
        currentPlayerIndex: 0,
        players: new LiveList([]),
        properties: {},
        freeParkingPool: 0,
        chanceIndex: 0,
        communityChestIndex: 0,
        tradeOffer: null,
        log: new LiveList([]),
        rules: savedRules,
        mapType: savedMapType,
        winnerIds: [],
        houseSupply: 32,
        hotelSupply: 12,
        lastRollWasDoubles: false,
        lastDiceRoll: { d1: 3, d2: 4, timestamp: 0 },
        auctionHighestBid: 0,
        auctionHighestBidderId: null,
        auctionEndTime: 0,
        hasRolled: false,
      }}
    >
      <TurnPresenceSync />
      {children}
    </RoomProvider>
  )
}
