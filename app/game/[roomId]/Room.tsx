'use client'

import { LiveList } from '@liveblocks/client'
import { useEffect, useMemo, useState } from 'react'
import type { GameRules } from '@/lib/liveblocks.config'
import { RoomProvider } from '@/lib/liveblocks.config'
import { useTurnSync } from '@/hooks/useTurnSync'

function TurnPresenceSync() {
  useTurnSync()
  return null
}

const DEFAULT_RULES: GameRules = { startingCash: 1500, freeParkingJackpot: false, auctionOnPass: true, speedDie: false, maxPlayers: 4 }

export default function Room({ roomId, children }: { roomId: string; children: React.ReactNode }) {
  const [username, setUsername] = useState<string | null>(null)
  const [needsName, setNeedsName] = useState(false)
  const [inputName, setInputName] = useState('')

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

  useEffect(() => {
    const saved = sessionStorage.getItem('fastopoly_username')
    if (saved) {
      setUsername(saved)
    } else {
      setNeedsName(true)
    }
  }, [])

  function handleConfirmName() {
    const trimmed = inputName.trim()
    if (!trimmed) return
    sessionStorage.setItem('fastopoly_username', trimmed)
    localStorage.setItem('fastopoly_username', trimmed)
    setUsername(trimmed)
    setNeedsName(false)
  }

  if (needsName) {
    return (
      <div className="min-h-screen bg-[#F7F0E4] p-8 text-zinc-900 flex items-center justify-center font-sans">
        <div className="w-full max-w-sm rounded-2xl border-[3px] border-[#2f4d20] bg-[#BAED91] p-6 shadow-2xl text-center">
          <h2 className="text-3xl font-black tracking-wider text-[#2f4d20] uppercase">Fastopoly</h2>
          <p className="mt-2 text-sm font-bold text-[#2f4d20]/80">Enter a username to join the game room.</p>
          <input
            value={inputName}
            onChange={(e) => setInputName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleConfirmName()
            }}
            className="mt-6 w-full rounded-lg border-2 border-[#2f4d20]/45 bg-[#fcfaf2] px-4 py-3 text-zinc-900 font-bold placeholder-zinc-400 outline-none focus:border-[#2f4d20]"
            placeholder="Username"
            maxLength={15}
            autoFocus
          />
          <button
            onClick={handleConfirmName}
            className="mt-4 w-full rounded-lg bg-[#2f4d20] px-4 py-3 font-black text-[#BAED91] hover:bg-[#2f4d20]/90 transition-transform active:scale-[0.98]"
          >
            Join Game
          </button>
        </div>
      </div>
    )
  }

  if (!username) {
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
        bank: 20580,
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
