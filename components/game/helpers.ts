import type { Player, Property } from '@/lib/liveblocks.config'
import { COLOR_GROUPS, getTile } from '@/lib/game-engine/board'

export type PlayerView = Readonly<Player>
export type PropertyView = Readonly<Property>
export type PropertyLookup = Record<string, PropertyView>

export const COLOR_GROUP_COLORS: Record<string, string> = {
  brown: '#C2A691',        // Soft Pastel Brown
  'light-blue': '#A8DADC',   // Pastel Ice Blue
  pink: '#F1A7C4',         // Pastel Rose Pink
  orange: '#FBC490',       // Soft Pastel Orange
  red: '#E5989B',          // Pastel Salmon Red
  yellow: '#F9E076',       // Pastel Muted Yellow
  green: '#A3C9A8',        // Pastel Sage Green
  'dark-blue': '#90B0D9',   // Pastel Soft Blue
  railroad: '#D8E2DC',     // Soft Grey-white
  utility: '#A8DADC',      // Soft Teal
}

export function formatMoney(value: number): string {
  return `$${Math.round(value).toLocaleString()}`
}

export function playerIdFromConnection(connectionId: number | undefined): string {
  return typeof connectionId === 'number' ? `player-${connectionId}` : ''
}

type LocalUserIdentity = {
  connectionId?: number
  presence?: {
    username?: string
  }
}

export function resolveLocalPlayer(
  players: readonly PlayerView[],
  self: LocalUserIdentity | null | undefined,
  preferredPlayerId?: string,
): PlayerView | undefined {
  const connectionPlayerId = playerIdFromConnection(self?.connectionId)
  const exactMatch = players.find((player) => player.id === connectionPlayerId)
  if (exactMatch) return exactMatch

  const username = self?.presence?.username
  if (!username) return undefined

  const preferredMatch = preferredPlayerId
    ? players.find((player) => player.id === preferredPlayerId && player.username === username)
    : undefined
  if (preferredMatch) return preferredMatch

  const usernameMatches = players.filter((player) => player.username === username)
  return usernameMatches.length === 1 ? usernameMatches[0] : usernameMatches[0]
}

export function colorForGroup(colorGroup: string | undefined): string {
  return colorGroup ? COLOR_GROUP_COLORS[colorGroup] ?? '#71717a' : '#71717a'
}

export function propertyDisplayName(propertyId: string): string {
  return getTile(propertyId)?.name ?? propertyId
}

export function isTradableProperty(property: PropertyView | undefined): boolean {
  return Boolean(property && !property.mortgaged && property.houses === 0 && property.hotels === 0)
}

export function ownsFullColorGroup(playerId: string, propertyId: string, properties: PropertyLookup): boolean {
  const tile = getTile(propertyId)
  if (!tile?.colorGroup || tile.colorGroup === 'railroad' || tile.colorGroup === 'utility') return false
  return (COLOR_GROUPS[tile.colorGroup] ?? []).every((id) => properties[id]?.ownerId === playerId)
}

export function calculatePlayerNetWorth(player: PlayerView, properties: PropertyLookup): number {
  return player.cash + player.properties.reduce((total, propertyId) => {
    const tile = getTile(propertyId)
    const property = properties[propertyId]
    if (!tile || !property) return total

    const baseValue = property.mortgaged ? tile.mortgage ?? 0 : tile.price ?? 0
    const buildingValue =
      property.houses * (tile.houseCost ?? 0) + property.hotels * ((tile.houseCost ?? 0) * 4 + (tile.hotelCost ?? 0))
    return total + baseValue + buildingValue
  }, 0)
}

export async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  const payload = (await response.json().catch(() => ({}))) as Partial<T> & { error?: string }
  if (!response.ok) {
    throw new Error(payload.error ?? 'Request failed')
  }

  return payload as T
}
