import type { Player, Property } from '@/lib/liveblocks.config'

export type PlayerResult = {
  playerId: string
  username: string
  placement: number
  pointsEarned: number
  bonuses: string[]
}

const placementPoints = new Map<number, number>([
  [1, 500],
  [2, 200],
  [3, 75],
])

export function calculateScores(players: Player[], properties: Map<string, Property>): PlayerResult[] {
  return [...players]
    .sort((first, second) => {
      if (first.isBankrupt !== second.isBankrupt) return first.isBankrupt ? 1 : -1
      const firstWorth = first.cash + first.properties.length * 10
      const secondWorth = second.cash + second.properties.length * 10
      return secondWorth - firstWorth
    })
    .map((player, index) => {
      const bonuses: string[] = []
      let pointsEarned = (placementPoints.get(index + 1) ?? 0) + 25

      if ((player.ownedColorGroups ?? []).length > 0) {
        pointsEarned += 50
        bonuses.push('Owned a full color group')
      }

      if (player.hasBuiltHotel || player.properties.some((id) => (properties.get(id)?.hotels ?? 0) > 0)) {
        pointsEarned += 50
        bonuses.push('Built at least one hotel')
      }

      const bankruptcies = player.bankruptciesCaused ?? 0
      if (bankruptcies > 0) {
        pointsEarned += bankruptcies * 30
        bonuses.push(`Bankrupted ${bankruptcies} player${bankruptcies === 1 ? '' : 's'}`)
      }

      return {
        playerId: player.id,
        username: player.username,
        placement: index + 1,
        pointsEarned,
        bonuses,
      }
    })
}
