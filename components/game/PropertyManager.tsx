'use client'

import { useMemo, useState } from 'react'
import { colorForGroup, formatMoney, ownsFullColorGroup, postJson, resolveLocalPlayer } from '@/components/game/helpers'
import { getTile } from '@/lib/game-engine/board'
import { useSelf, useStorage } from '@/lib/liveblocks.config'

type PropertyManagerProps = {
  roomId: string
  playerId: string
  embedded?: boolean
  onClose?: () => void
}

type PropertyAction = 'build' | 'demolish' | 'mortgage' | 'unmortgage'

type ActionResponse = {
  success: boolean
}

function actionLabel(action: PropertyAction): string {
  if (action === 'build') return 'Build'
  if (action === 'demolish') return 'Demolish'
  if (action === 'mortgage') return 'Mortgage'
  return 'Unmortgage'
}

export default function PropertyManager({ roomId, playerId, embedded = false, onClose }: PropertyManagerProps) {
  const storedPlayers = useStorage((root) => root.players)
  const players = useMemo(() => storedPlayers ?? [], [storedPlayers])
  const properties = useStorage((root) => root.properties)
  const self = useSelf()
  const player = players.find((candidate) => candidate.id === playerId)
  const selfPlayer = resolveLocalPlayer(players, self, playerId)
  const isOwnPanel = playerId === selfPlayer?.id
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const ownedTiles = useMemo(() => {
    if (!player) return []
    return player.properties
      .map((propertyId) => getTile(propertyId))
      .filter((tile): tile is NonNullable<typeof tile> => Boolean(tile))
      .sort((first, second) => first.index - second.index)
  }, [player])

  async function runAction(propertyId: string, action: PropertyAction) {
    setBusyKey(`${propertyId}:${action}`)
    setErrors((current) => ({ ...current, [propertyId]: '' }))

    try {
      if (action === 'mortgage' || action === 'unmortgage') {
        await postJson<ActionResponse>('/api/game/mortgage', { roomId, playerId, propertyId, action })
      } else {
        await postJson<ActionResponse>('/api/game/build', { roomId, playerId, propertyId, action })
      }
    } catch (error) {
      setErrors((current) => ({
        ...current,
        [propertyId]: error instanceof Error ? error.message : `${actionLabel(action)} failed`,
      }))
    } finally {
      setBusyKey(null)
    }
  }

  if (!player || !properties) {
    return <div className="text-sm text-zinc-700 font-semibold">Properties unavailable.</div>
  }

  const outerClass = embedded
    ? 'mt-3 border-t border-[#e58a74]/30 pt-3 px-3 pb-3'
    : 'rounded-lg border border-[#e58a74]/40 bg-[#EFA38F] p-5 shadow-2xl shadow-black/20'

  return (
    <section className={outerClass}>
      <div className="flex items-center justify-between gap-3 flex-wrap border-b border-[#e58a74]/30 pb-2.5 mb-3">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-black text-zinc-900 uppercase tracking-wide">{player.username}&apos;s properties</h2>
          <span className="text-[10px] font-black uppercase text-zinc-800 bg-white/30 px-2.5 py-0.5 rounded border border-[#e58a74]/20 shadow-sm">
            {isOwnPanel ? 'Manage' : 'Read-only'}
          </span>
        </div>
        {onClose ? (
          <button onClick={onClose} className="rounded-md border border-[#d28b7a] bg-white/20 px-3 py-1.5 text-xs font-bold text-zinc-800 hover:border-[#b86e5e] hover:bg-white/40 active:scale-95 transition-all">
            Close
          </button>
        ) : null}
      </div>

      {/* Embedded, this list hangs off a player card inside a rail that clips rather
        * than scrolls, so a large portfolio ran off the bottom of the viewport and
        * took the collapse control with it. Capped and scrolled in place, the card
        * can always be closed. The modal form is already inside a scrollable shell. */}
      <div className={`mt-4 grid gap-3 ${embedded ? 'max-h-[40vh] overflow-y-auto pr-1' : ''}`}>
        {ownedTiles.length === 0 ? <p className="text-sm text-zinc-700">No properties owned yet.</p> : null}
        {ownedTiles.map((tile) => {
          const property = properties[tile.id]
          if (!property) return null

          const hasBuildings = property.houses > 0 || property.hotels > 0
          const fullGroup = ownsFullColorGroup(player.id, tile.id, properties)
          const canBuild = isOwnPanel && !property.mortgaged && fullGroup && tile.type === 'property'
          const buildCost = property.houses === 4 ? tile.hotelCost ?? 0 : tile.houseCost ?? 0
          const canAffordBuild = player.cash >= buildCost
          const mortgageValue = tile.mortgage ?? 0
          const unmortgageCost = Math.ceil(mortgageValue * 1.1)
          const rowError = errors[tile.id]

          return (
            <div key={tile.id} className="rounded-md border border-[#e58a74]/30 bg-white/50 p-3 backdrop-blur-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-sm border border-black/10" style={{ backgroundColor: colorForGroup(tile.colorGroup) }} />
                    <p className="truncate font-semibold text-zinc-900">{tile.name}</p>
                    {property.mortgaged ? (
                      <span className="rounded-full border border-red-700/35 bg-red-500/10 px-2 py-0.5 text-[10px] font-black uppercase text-red-950">Mortgaged</span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-zinc-700 font-semibold">
                    {property.hotels > 0 ? 'Hotel' : `${property.houses} house${property.houses === 1 ? '' : 's'}`} - Mortgage {formatMoney(mortgageValue)}
                  </p>
                </div>

                {isOwnPanel ? (
                  <div className="flex flex-wrap justify-end gap-2">
                    {canBuild && property.hotels === 0 && property.houses < 4 ? (
                      <button
                        onClick={() => void runAction(tile.id, 'build')}
                        disabled={!canAffordBuild || busyKey !== null}
                        className="rounded-md bg-[#1a472a] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#235d38] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Build House
                      </button>
                    ) : null}
                    {canBuild && property.houses === 4 ? (
                      <button
                        onClick={() => void runAction(tile.id, 'build')}
                        disabled={!canAffordBuild || busyKey !== null}
                        className="rounded-md bg-[#1a472a] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#235d38] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Build Hotel
                      </button>
                    ) : null}
                    {hasBuildings ? (
                      <button
                        onClick={() => void runAction(tile.id, 'demolish')}
                        disabled={busyKey !== null}
                        className="rounded-md border border-[#d28b7a] bg-white/20 px-3 py-1.5 text-xs font-bold text-zinc-800 hover:border-[#b86e5e] hover:bg-white/40 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Demolish
                      </button>
                    ) : null}
                    {!property.mortgaged && !hasBuildings ? (
                      <button
                        onClick={() => void runAction(tile.id, 'mortgage')}
                        disabled={busyKey !== null}
                        className="rounded-md border border-[#d28b7a] bg-white/20 px-3 py-1.5 text-xs font-bold text-zinc-800 hover:border-[#b86e5e] hover:bg-white/40 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Mortgage
                      </button>
                    ) : null}
                    {property.mortgaged ? (
                      <button
                        onClick={() => void runAction(tile.id, 'unmortgage')}
                        disabled={player.cash < unmortgageCost || busyKey !== null}
                        className="rounded-md border border-emerald-700 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-950 hover:border-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Unmortgage {formatMoney(unmortgageCost)}
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {rowError ? <p className="mt-2 text-xs font-black text-red-900">{rowError}</p> : null}
            </div>
          )
        })}
      </div>
    </section>
  )
}
