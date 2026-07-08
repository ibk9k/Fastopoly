import type { Player, Property } from '@/lib/liveblocks.config'
import { getTile } from './board'

export function checkBankruptcy(
  player: Player,
  debtAmount: number,
  creditorId: string | 'bank',
  allProperties: Map<string, Property>,
): { isBankrupt: boolean; liquidationValue: number } {
  const liquidationValue = player.properties.reduce((total, propertyId) => {
    const tile = getTile(propertyId)
    const property = allProperties.get(propertyId)
    if (!tile || !property) return total

    const mortgageValue = property.mortgaged ? 0 : tile.mortgage ?? 0
    const buildingValue =
      Math.floor(((property.houses * (tile.houseCost ?? 0)) + (property.hotels * (tile.hotelCost ?? 0))) / 2)

    return total + mortgageValue + buildingValue
  }, 0)

  const isBankrupt = player.cash + liquidationValue < debtAmount

  if (isBankrupt) {
    player.isBankrupt = true
    player.properties.forEach((propertyId) => {
      const property = allProperties.get(propertyId)
      if (!property) return
      property.ownerId = creditorId === 'bank' ? null : creditorId
      property.houses = 0
      property.hotels = 0
      property.mortgaged = creditorId !== 'bank'
    })
    player.properties = []
    player.cash = 0
  }

  return { isBankrupt, liquidationValue }
}
