'use client'

import { useMemo, useState } from 'react'
import PropertyManager from '@/components/game/PropertyManager'
import PropertyDetailModal from '@/components/game/PropertyDetailModal'
import { colorForGroup, formatMoney, playerIdFromConnection, resolveLocalPlayer, truncateUsername } from '@/components/game/helpers'
import { getTile } from '@/lib/game-engine/board'
import { useCountdown } from '@/hooks/useCountdown'
import { URGENT_THRESHOLD_SECONDS } from '@/lib/game-engine/timing'
import { useOthers, useSelf, useStorage } from '@/lib/liveblocks.config'

function formatClock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

type PlayerDashboardProps = {
  roomId: string
}

export default function PlayerDashboard({ roomId }: PlayerDashboardProps) {
  const storedPlayers = useStorage((root) => root.players)
  const players = useMemo(() => storedPlayers ?? [], [storedPlayers])
  const properties = useStorage((root) => root.properties)
  const currentPlayerIndex = useStorage((root) => root.currentPlayerIndex) ?? 0
  const gamePhase = useStorage((root) => root.gamePhase)
  const turnDeadline = useStorage((root) => root.turnDeadline)
  const others = useOthers()
  const self = useSelf()

  const timerRunning = gamePhase === 'playing' || gamePhase === 'buy_decision' || gamePhase === 'landed'
  const secondsLeft = useCountdown(timerRunning ? turnDeadline : null)
  const [expandedPlayerId, setExpandedPlayerId] = useState<string | null>(null)
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null)

  const activePlayer = players[currentPlayerIndex]
  const selfPlayer = resolveLocalPlayer(players, self, activePlayer?.id)
  const isActivePlayer = Boolean(activePlayer && selfPlayer && activePlayer.id === selfPlayer.id)

  const ownersById = useMemo(() => new Map(players.map((player) => [player.id, player])), [players])

  const connectedIds = useMemo(() => {
    const ids = new Set<string>()
    if (self) ids.add(playerIdFromConnection(self.connectionId))
    others.forEach((other) => ids.add(playerIdFromConnection(other.connectionId)))
    return ids
  }, [others, self])

  const connectedUsernames = useMemo(() => {
    const usernames = new Set<string>()
    if (self?.presence.username) usernames.add(self.presence.username)
    others.forEach((other) => {
      if (other.presence.username) usernames.add(other.presence.username)
    })
    return usernames
  }, [others, self])

  const selectedTile = selectedPropertyId ? getTile(selectedPropertyId) : undefined
  const selectedProperty = selectedPropertyId && properties ? properties[selectedPropertyId] : undefined
  const selectedOwner = selectedProperty?.ownerId ? ownersById.get(selectedProperty.ownerId) : undefined

  if (!properties) {
    return <section className="rounded-lg border border-[#e58a74]/40 bg-[#EFA38F] p-4 text-sm text-zinc-700">Loading players...</section>
  }

  return (
    <>
      <section className="rounded-lg border border-[#e58a74]/40 bg-[#EFA38F] p-4 shadow-sm flex flex-col min-h-0 flex-1 overflow-x-hidden">
        <div className="flex items-center justify-between flex-shrink-0">
          <h2 className="font-black text-zinc-900">Players</h2>
          <p className="text-xs text-zinc-700">{players.length} seated</p>
        </div>

        <div className="mt-4 grid gap-3 overflow-y-auto overflow-x-hidden pr-1 flex-1 min-h-0">
          {players.map((player, index) => {
            const isActive = index === currentPlayerIndex
            const isConnected = connectedIds.has(player.id) || connectedUsernames.has(player.username)
            const connectionLabel = isConnected ? 'Connected' : 'Away'

            return (
              <div
                key={player.id}
                aria-current={isActive ? 'true' : undefined}
                // Whose turn it is reads off the card's own outline rather than a
                // "Turn" pill competing with the name for the row's width. Border and
                // glow share one colour so the edge reads as a single thick band; both
                // draw outside the box, so switching turns never reflows the list.
                // The border width is constant so turning the marker on never shifts
                // the row by a pixel; only the colour and the inset glow change.
                className={`rounded-md border-2 bg-white/40 backdrop-blur-sm overflow-x-hidden transition-[box-shadow,border-color] duration-300 ease-out ${
                  isActive ? 'border-pine-bright shadow-turn' : 'border-salmon-line/40'
                } ${player.isBankrupt ? 'opacity-50' : ''}`}
              >
                <button
                  onClick={() => setExpandedPlayerId((current) => (current === player.id ? null : player.id))}
                  className="w-full px-3 py-3 text-left overflow-x-hidden"
                >
                  <div className="flex items-center justify-between gap-2 min-w-0">
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      {/* The seat colour and the connection state share one mark: the
                        * disc is the seat, the ring around it is presence. It replaces
                        * a "Connected" caption line and an "Away" pill that between
                        * them said the same thing twice. */}
                      <span
                        title={connectionLabel}
                        className={`inline-block h-3.5 w-3.5 shrink-0 rounded-full ring-2 ${
                          isConnected ? 'ring-success' : 'ring-amber-500'
                        }`}
                        style={{ backgroundColor: player.color }}
                      />
                      <span className="sr-only">{connectionLabel}</span>
                      <p
                        title={player.username}
                        className={`font-bold text-zinc-900 truncate ${player.isBankrupt ? 'line-through text-zinc-600' : ''}`}
                      >
                        {truncateUsername(player.username, 10)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      {isActive && !player.isBankrupt && secondsLeft !== null ? (
                        <span
                          // Bare clock: it only ever appears on the active card, which
                          // the outline already identifies, so a "Turn" label was noise.
                          // Debt keeps its longer deadline and the DebtOverlay; here the
                          // danger colour is the whole signal.
                          aria-label={`${formatClock(secondsLeft)} left`}
                          className={`text-xs font-extrabold tabular-nums ${
                            player.cash < 0 || secondsLeft <= URGENT_THRESHOLD_SECONDS ? 'text-danger' : 'text-pine'
                          }`}
                        >
                          {formatClock(secondsLeft)}
                        </span>
                      ) : null}
                      <p className="font-black text-zinc-900">{formatMoney(player.cash)}</p>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1">
                    {player.properties.length === 0 ? <span className="text-xs text-zinc-600">No deeds</span> : null}
                    {player.properties.map((propertyId) => {
                      const tile = getTile(propertyId)
                      const property = properties[propertyId]
                      return (
                        <span
                          key={propertyId}
                          className={`h-3 w-6 rounded-sm border border-black/30 cursor-pointer transition-transform hover:scale-110 ${property?.mortgaged ? 'opacity-45' : ''}`}
                          style={{ backgroundColor: colorForGroup(tile?.colorGroup) }}
                          title={tile?.name ?? propertyId}
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedPropertyId(propertyId)
                          }}
                        />
                      )
                    })}
                  </div>
                </button>

                {expandedPlayerId === player.id ? <PropertyManager roomId={roomId} playerId={player.id} embedded /> : null}
              </div>
            )
          })}
        </div>
      </section>

      {/* Property Detail Modal opened from dashboard */}
      {selectedTile && properties ? (
        <PropertyDetailModal
          tile={selectedTile}
          property={selectedProperty}
          owner={selectedOwner}
          selfPlayer={selfPlayer}
          isActivePlayer={isActivePlayer}
          allProperties={properties}
          roomId={roomId}
          onClose={() => setSelectedPropertyId(null)}
        />
      ) : null}
    </>
  )
}
