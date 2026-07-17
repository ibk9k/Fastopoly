'use client'

import { useMemo, useState } from 'react'
import PropertyManager from '@/components/game/PropertyManager'
import PropertyDetailModal from '@/components/game/PropertyDetailModal'
import { calculatePlayerNetWorth, colorForGroup, formatMoney, playerIdFromConnection, resolveLocalPlayer } from '@/components/game/helpers'
import { getTile } from '@/lib/game-engine/board'
import { useOthers, useSelf, useStorage } from '@/lib/liveblocks.config'

type PlayerDashboardProps = {
  roomId: string
}

export default function PlayerDashboard({ roomId }: PlayerDashboardProps) {
  const storedPlayers = useStorage((root) => root.players)
  const players = useMemo(() => storedPlayers ?? [], [storedPlayers])
  const properties = useStorage((root) => root.properties)
  const currentPlayerIndex = useStorage((root) => root.currentPlayerIndex) ?? 0
  const others = useOthers()
  const self = useSelf()
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
      <section className="rounded-lg border border-[#e58a74]/40 bg-[#EFA38F] p-4 shadow-sm flex flex-col min-h-0 flex-1">
        <div className="flex items-center justify-between flex-shrink-0">
          <h2 className="font-black text-zinc-900">Players</h2>
          <p className="text-xs text-zinc-700">{players.length} seated</p>
        </div>

        <div className="mt-4 grid gap-3 overflow-y-auto pr-1 flex-1 min-h-0">
          {players.map((player, index) => {
            const isActive = index === currentPlayerIndex
            const isConnected = connectedIds.has(player.id) || connectedUsernames.has(player.username)
            const netWorth = calculatePlayerNetWorth(player, properties)

            return (
              <div
                key={player.id}
                aria-current={isActive ? 'true' : undefined}
                className={`rounded-md border bg-white/40 backdrop-blur-sm transition ${
                  isActive ? 'border-pine shadow-[0_0_0_1px_rgba(47,77,32,.25)]' : 'border-salmon-line/40'
                } ${player.isBankrupt ? 'opacity-50' : ''}`}
              >
                <button
                  onClick={() => setExpandedPlayerId((current) => (current === player.id ? null : player.id))}
                  className="w-full px-3 py-3 text-left"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded-full border border-black/10" style={{ backgroundColor: player.color }} />
                        <p className={`truncate font-bold text-zinc-900 ${player.isBankrupt ? 'line-through text-zinc-600' : ''}`}>{player.username}</p>
                        {isActive ? <span className="rounded-full bg-pine px-2 py-0.5 text-[10px] font-black uppercase text-felt">Turn</span> : null}
                        {!isConnected && !player.isBankrupt ? (
                          <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-black uppercase text-amber-900">Away</span>
                        ) : null}
                      </div>
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-zinc-700">
                        <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${isConnected ? 'bg-success' : 'bg-amber-500'}`} />
                        {isConnected ? 'Connected' : 'Away'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-black text-zinc-900">{formatMoney(player.cash)}</p>
                      <p className="text-xs text-zinc-700">Worth {formatMoney(netWorth)}</p>
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
