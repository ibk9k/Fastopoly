import type { Property } from '@/lib/liveblocks.config'
import { COLOR_GROUPS, getTile } from './board'

export function calculateRent(
  propertyId: string,
  property: Property,
  allProperties: Map<string, Property>,
  diceRoll = 0,
): number {
  if (property.mortgaged || !property.ownerId) return 0

  const tile = getTile(propertyId)
  if (!tile?.rentLadder) return 0

  if (tile.type === 'railroad') {
    const ownedRailroads = (COLOR_GROUPS.railroad ?? []).filter(
      (id) => allProperties.get(id)?.ownerId === property.ownerId,
    ).length
    return 25 * 2 ** Math.max(ownedRailroads - 1, 0)
  }

  if (tile.type === 'utility') {
    const ownedUtilities = (COLOR_GROUPS.utility ?? []).filter(
      (id) => allProperties.get(id)?.ownerId === property.ownerId,
    ).length
    return diceRoll * (ownedUtilities === 2 ? 10 : 4)
  }

  const groupIds = tile.colorGroup ? COLOR_GROUPS[tile.colorGroup] ?? [] : []
  const ownsFullGroup = groupIds.every((id) => allProperties.get(id)?.ownerId === property.ownerId)
  const ladderIndex = property.hotels > 0 ? 5 : property.houses
  const rent = tile.rentLadder[ladderIndex] ?? tile.rentLadder[0]

  if (ownsFullGroup && property.houses === 0 && property.hotels === 0) {
    return rent * 2
  }

  return rent
}
