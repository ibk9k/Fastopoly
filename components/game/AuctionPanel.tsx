/* eslint-disable @next/next/no-img-element */
'use client'

import { useEffect, useMemo, useState } from 'react'
import { getTile } from '@/lib/game-engine/board'
import { useOthers, useSelf, useStorage } from '@/lib/liveblocks.config'
import { colorForGroup, formatMoney, postJson, resolveLocalPlayer } from '@/components/game/helpers'

type AuctionPanelProps = {
  roomId: string
  onClose: () => void
}

export default function AuctionPanel({ roomId, onClose }: AuctionPanelProps) {
  const self = useSelf()
  const others = useOthers()
  const storedPlayers = useStorage((root) => root.players)
  const players = useMemo(() => storedPlayers ?? [], [storedPlayers])

  // The auto-resolver is the lowest-connectionId client that actually holds a seat (and
  // therefore a token). Electing among seated connections avoids a spectator stalling the
  // auction now that auction-resolve requires a player token. (Phase 3 replaces this with
  // server-side lazy resolution.)
  const isResponsible = useMemo(() => {
    if (!self || typeof self.connectionId !== 'number') return false
    const connections = [
      { connectionId: self.connectionId, presence: self.presence },
      ...others.map((o) => ({ connectionId: o.connectionId, presence: o.presence })),
    ]
    const seatedIds = connections
      .filter((c) => typeof c.connectionId === 'number' && Boolean(resolveLocalPlayer(players, c)))
      .map((c) => c.connectionId as number)
      .sort((a, b) => a - b)
    return seatedIds.length > 0 && self.connectionId === seatedIds[0]
  }, [self, others, players])
  
  const auctionPropertyId = useStorage((root) => root.auctionPropertyId)
  const storedAuctionBids = useStorage((root) => root.auctionBids)
  const auctionBids = useMemo(() => storedAuctionBids ?? [], [storedAuctionBids])
  const auctionHighestBid = useStorage((root) => root.auctionHighestBid) ?? 0
  const auctionHighestBidderId = useStorage((root) => root.auctionHighestBidderId) ?? null
  const auctionEndTime = useStorage((root) => root.auctionEndTime) ?? 0
  const gamePhase = useStorage((root) => root.gamePhase)
  const currentPlayerIndex = useStorage((root) => root.currentPlayerIndex) ?? 0
  const activePlayer = players[currentPlayerIndex]

  const tile = auctionPropertyId ? getTile(auctionPropertyId) : null
  const selfPlayer = resolveLocalPlayer(players, self, activePlayer?.id)

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [currentTime, setCurrentTime] = useState(Date.now())
  const [resolving, setResolving] = useState(false)

  // Update timer every 250ms
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now())
    }, 250)
    return () => clearInterval(interval)
  }, [])

  // Auto-resolve when countdown expires
  useEffect(() => {
    if (
      auctionEndTime > 0 &&
      currentTime >= auctionEndTime &&
      gamePhase === 'auction' &&
      isResponsible &&
      !resolving &&
      auctionPropertyId &&
      selfPlayer
    ) {
      setResolving(true)
      postJson('/api/game/auction-resolve', { roomId, playerId: selfPlayer.id })
        .catch((err) => console.error('Failed to auto-resolve auction:', err))
        .finally(() => setResolving(false))
    }
  }, [currentTime, auctionEndTime, gamePhase, resolving, roomId, auctionPropertyId, isResponsible, selfPlayer])

  const timeRemaining = Math.max(0, Math.ceil((auctionEndTime - currentTime) / 1000))
  const isExpired = timeRemaining <= 0

  // Format bid history log
  const bidHistory = useMemo(() => {
    return [...auctionBids]
      .sort((first, second) => second.timestamp - first.timestamp)
      .map((bid) => {
        const bidder = players.find((p) => p.id === bid.playerId)
        return {
          ...bid,
          username: bidder?.username ?? 'Unknown',
        }
      })
  }, [auctionBids, players])

  const currentWinner = useMemo(() => {
    if (!auctionHighestBidderId) return null
    return players.find((p) => p.id === auctionHighestBidderId)
  }, [auctionHighestBidderId, players])

  async function placeBid(increment: number) {
    if (!selfPlayer || !auctionPropertyId || isExpired || submitting) return

    setSubmitting(true)
    setError('')
    try {
      await postJson('/api/game/auction', {
        roomId,
        playerId: selfPlayer.id,
        increment,
      })
    } catch (bidError) {
      setError(bidError instanceof Error ? bidError.message : 'Bid failed')
    } finally {
      setSubmitting(false)
    }
  }

  function renderTitleDeedCard() {
    if (!tile) return null

    const headerColor = colorForGroup(tile.colorGroup)
    const isSpecial = tile.type === 'railroad' || tile.type === 'utility'

    return (
      <div className="mx-auto w-full max-w-[240px] h-[300px] flex flex-col justify-between rounded-lg border-2 border-black bg-white p-3 shadow-md text-zinc-950 font-sans">
        {isSpecial ? (
          <div className="border-2 border-black p-2 mb-2 text-center rounded-sm flex flex-col items-center justify-center" style={{ backgroundColor: headerColor }}>
            {tile.type === 'railroad' ? (
              <img src="/Railroad.png" alt="" className="h-6 w-6 object-contain mb-1" />
            ) : tile.id === 'electric-company' ? (
              <img src="/Electric.png" alt="" className="h-6 w-6 object-contain mb-1" />
            ) : (
              <img src="/Water.png" alt="" className="h-6 w-6 object-contain mb-1" />
            )}
            <h3 className="text-xs font-black uppercase leading-tight text-zinc-900">{tile.name}</h3>
          </div>
        ) : (
          <div className="border-2 border-black p-2 mb-2 text-center rounded-sm" style={{ backgroundColor: headerColor }}>
            <span className="text-[9px] font-black uppercase tracking-widest text-zinc-900/80">Title Deed</span>
            <h3 className="text-sm font-black uppercase leading-tight text-zinc-900">{tile.name}</h3>
          </div>
        )}

        <div className="flex-1 flex flex-col justify-between text-xs font-semibold mt-1">
          {tile.type === 'property' && tile.rentLadder && (
            <div className="space-y-1">
              <div className="flex justify-between text-[11px] font-bold">
                <span>Rent:</span>
                <span>{formatMoney(tile.rentLadder[0])}</span>
              </div>
              <div className="space-y-0.5 text-[10px] font-medium text-zinc-700">
                <div className="flex justify-between">
                  <span>With 1 House:</span>
                  <span>{formatMoney(tile.rentLadder[1])}</span>
                </div>
                <div className="flex justify-between">
                  <span>With 2 Houses:</span>
                  <span>{formatMoney(tile.rentLadder[2])}</span>
                </div>
                <div className="flex justify-between">
                  <span>With 3 Houses:</span>
                  <span>{formatMoney(tile.rentLadder[3])}</span>
                </div>
                <div className="flex justify-between">
                  <span>With 4 Houses:</span>
                  <span>{formatMoney(tile.rentLadder[4])}</span>
                </div>
                <div className="flex justify-between font-bold text-zinc-950">
                  <span>With HOTEL:</span>
                  <span>{formatMoney(tile.rentLadder[5])}</span>
                </div>
              </div>
              <div className="border-t border-black/10 pt-1 text-[9px] text-center font-bold text-zinc-500">
                Houses Cost {formatMoney(tile.houseCost ?? 50)} Each
              </div>
            </div>
          )}

          {tile.type === 'railroad' && (
            <div className="space-y-1 text-[10px] font-medium text-zinc-700">
              <div className="flex justify-between">
                <span>Rent (1 owned):</span>
                <span>$25</span>
              </div>
              <div className="flex justify-between">
                <span>Rent (2 owned):</span>
                <span>$50</span>
              </div>
              <div className="flex justify-between">
                <span>Rent (3 owned):</span>
                <span>$100</span>
              </div>
              <div className="flex justify-between">
                <span>Rent (4 owned):</span>
                <span>$200</span>
              </div>
            </div>
          )}

          {tile.type === 'utility' && (
            <div className="space-y-1 text-[10px] font-medium text-zinc-700 leading-snug">
              <p className="text-center italic">
                If 1 Utility is owned, rent is 4 times the dice roll value.
              </p>
              <p className="text-center italic">
                If 2 Utilities are owned, rent is 10 times the dice roll value.
              </p>
            </div>
          )}

          <div className="border-t border-black/10 pt-1 space-y-0.5">
            <div className="flex justify-between text-[10px]">
              <span>Mortgage Value:</span>
              <span>{formatMoney(tile.mortgage ?? 0)}</span>
            </div>
            <div className="flex justify-between text-[10px]">
              <span>Value:</span>
              <span>{formatMoney(tile.price ?? 0)}</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!tile || gamePhase !== 'auction') return null

  const isBiddingDisabled = (increment: number) => {
    if (!selfPlayer || selfPlayer.isBankrupt || submitting || isExpired || resolving) return true
    return auctionHighestBid + increment > selfPlayer.cash
  }

  // Calculate timer percent for visual progress bar
  const maxTime = 30
  const timePercent = Math.min(100, (timeRemaining / maxTime) * 100)
  const isTimeCritical = timeRemaining <= 10

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 px-4 py-8 text-zinc-900">
      <section className="w-full max-w-3xl rounded-xl border-2 border-[#d28b7a] bg-[#F7F0E4] p-5 shadow-2xl">
        {/* Header with Title and Countdown */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#d28b7a]/30 pb-3">
          <div>
            <h2 className="text-xl font-black text-zinc-900 tracking-wide uppercase">Live Auction</h2>
            <p className="text-xs text-zinc-700">Bid in real time before the timer runs out!</p>
          </div>
          <div className="flex flex-col items-end">
            <span className={`text-base font-black ${isTimeCritical ? 'text-red-600 animate-pulse' : 'text-emerald-800'}`}>
              🕒 {timeRemaining}s
            </span>
            <div className="mt-1 h-1.5 w-28 rounded-full bg-zinc-200 overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${isTimeCritical ? 'bg-red-600' : 'bg-emerald-600'}`}
                style={{ width: `${timePercent}%` }}
              />
            </div>
          </div>
        </div>

        {/* Main Content Layout */}
        <div className="mt-4 grid gap-5 md:grid-cols-2">
          {/* Left Column: Title Deed */}
          <div className="flex items-center justify-center rounded-lg border border-[#e58a74]/20 bg-white/40 p-4">
            {renderTitleDeedCard()}
          </div>

          {/* Right Column: Bid Actions & Status */}
          <div className="flex flex-col justify-between">
            {/* Bid Status */}
            <div className="rounded-lg border border-[#e58a74]/30 bg-white/50 p-4 shadow-sm text-center">
              <p className="text-xs uppercase tracking-wider text-zinc-500 font-black">Current Highest Bid</p>
              <h3 className="mt-1 text-3xl font-black text-emerald-800">{formatMoney(auctionHighestBid)}</h3>
              <p className="mt-1 text-xs font-semibold text-zinc-700">
                {currentWinner ? (
                  <span>
                    Held by <span className="font-bold text-zinc-950">{currentWinner.username}</span>
                  </span>
                ) : (
                  <span className="italic text-zinc-500">No bids placed yet</span>
                )}
              </p>
            </div>

            {/* Bidding Controls */}
            <div className="mt-4 rounded-lg border border-[#e58a74]/20 bg-white/30 p-4 text-center">
              {selfPlayer ? (
                selfPlayer.isBankrupt ? (
                  <p className="text-sm font-bold text-red-800">You are bankrupt and cannot participate.</p>
                ) : (
                  <>
                    <div className="flex justify-between items-center text-xs font-bold text-zinc-700 px-1 mb-2">
                      <span>Your Balance:</span>
                      <span className="text-zinc-950">{formatMoney(selfPlayer.cash)}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        onClick={() => void placeBid(2)}
                        disabled={isBiddingDisabled(2)}
                        className="flex flex-col items-center justify-center rounded-md bg-[#1a472a] hover:bg-[#235d38] disabled:bg-zinc-400 disabled:cursor-not-allowed py-2 text-white font-black shadow-sm transition"
                      >
                        <span className="text-sm">+$2</span>
                        <span className="text-[9px] opacity-70">Bid {formatMoney(auctionHighestBid + 2)}</span>
                      </button>
                      <button
                        onClick={() => void placeBid(10)}
                        disabled={isBiddingDisabled(10)}
                        className="flex flex-col items-center justify-center rounded-md bg-[#1a472a] hover:bg-[#235d38] disabled:bg-zinc-400 disabled:cursor-not-allowed py-2 text-white font-black shadow-sm transition"
                      >
                        <span className="text-sm">+$10</span>
                        <span className="text-[9px] opacity-70">Bid {formatMoney(auctionHighestBid + 10)}</span>
                      </button>
                      <button
                        onClick={() => void placeBid(50)}
                        disabled={isBiddingDisabled(50)}
                        className="flex flex-col items-center justify-center rounded-md bg-[#1a472a] hover:bg-[#235d38] disabled:bg-zinc-400 disabled:cursor-not-allowed py-2 text-white font-black shadow-sm transition"
                      >
                        <span className="text-sm">+$50</span>
                        <span className="text-[9px] opacity-70">Bid {formatMoney(auctionHighestBid + 50)}</span>
                      </button>
                    </div>
                  </>
                )
              ) : (
                <p className="text-sm font-semibold text-zinc-600">Spectating (Not seated in room)</p>
              )}
              {error ? <p className="mt-2 text-xs font-bold text-red-800">{error}</p> : null}
            </div>

            {/* Scrollable Bid History Feed */}
            <div className="mt-4 rounded-lg border border-[#e58a74]/20 bg-white/40 p-3 h-36 overflow-y-auto">
              <p className="text-xs uppercase tracking-wider text-zinc-500 font-black mb-1.5 pb-1 border-b border-[#d28b7a]/20">
                Bid History Feed
              </p>
              <div className="space-y-1.5 text-xs">
                {bidHistory.length === 0 ? (
                  <p className="text-zinc-400 italic text-center py-4">No bids placed yet.</p>
                ) : (
                  bidHistory.map((bid) => (
                    <div key={bid.timestamp + '-' + bid.amount} className="flex justify-between items-center bg-white/50 px-2 py-1 rounded-sm">
                      <span className="font-semibold text-zinc-800">{bid.username}</span>
                      <span className="font-black text-emerald-800">{formatMoney(bid.amount)}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer info (closing details) */}
        {isExpired ? (
          <div className="mt-4 text-center text-xs font-bold text-zinc-600 animate-pulse">
            Closing and finalizing auction bids...
          </div>
        ) : (
          <div className="mt-4 text-center text-[10px] text-zinc-500 font-semibold leading-tight">
            ⚠️ Bidding in the last 10 seconds extends the timer back to 10 seconds to allow counters.
          </div>
        )}
      </section>
    </div>
  )
}
