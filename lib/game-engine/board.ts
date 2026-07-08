export type TileType =
  | 'go'
  | 'property'
  | 'railroad'
  | 'utility'
  | 'tax'
  | 'chance'
  | 'community_chest'
  | 'jail'
  | 'go_to_jail'
  | 'free_parking'

export type Tile = {
  id: string
  index: number
  name: string
  type: TileType
  colorGroup?: string
  price?: number
  rentLadder?: number[]
  houseCost?: number
  hotelCost?: number
  mortgage?: number
  tax?: number
}

const railroadRent = [25, 50, 100, 200]
const utilityRent = [4, 10]

export const BOARD: Tile[] = [
  { id: 'go', index: 0, name: 'Go', type: 'go' },
  { id: 'mediterranean-avenue', index: 1, name: 'Mediterranean Avenue', type: 'property', colorGroup: 'brown', price: 60, rentLadder: [2, 10, 30, 90, 160, 250], houseCost: 50, hotelCost: 50, mortgage: 30 },
  { id: 'community-chest-1', index: 2, name: 'Community Chest', type: 'community_chest' },
  { id: 'baltic-avenue', index: 3, name: 'Baltic Avenue', type: 'property', colorGroup: 'brown', price: 60, rentLadder: [4, 20, 60, 180, 320, 450], houseCost: 50, hotelCost: 50, mortgage: 30 },
  { id: 'income-tax', index: 4, name: 'Income Tax', type: 'tax', tax: 200 },
  { id: 'reading-railroad', index: 5, name: 'Reading Railroad', type: 'railroad', colorGroup: 'railroad', price: 200, rentLadder: railroadRent, mortgage: 100 },
  { id: 'oriental-avenue', index: 6, name: 'Oriental Avenue', type: 'property', colorGroup: 'light-blue', price: 100, rentLadder: [6, 30, 90, 270, 400, 550], houseCost: 50, hotelCost: 50, mortgage: 50 },
  { id: 'chance-1', index: 7, name: 'Chance', type: 'chance' },
  { id: 'vermont-avenue', index: 8, name: 'Vermont Avenue', type: 'property', colorGroup: 'light-blue', price: 100, rentLadder: [6, 30, 90, 270, 400, 550], houseCost: 50, hotelCost: 50, mortgage: 50 },
  { id: 'connecticut-avenue', index: 9, name: 'Connecticut Avenue', type: 'property', colorGroup: 'light-blue', price: 120, rentLadder: [8, 40, 100, 300, 450, 600], houseCost: 50, hotelCost: 50, mortgage: 60 },
  { id: 'jail', index: 10, name: 'Jail / Just Visiting', type: 'jail' },
  { id: 'st-charles-place', index: 11, name: 'St. Charles Place', type: 'property', colorGroup: 'pink', price: 140, rentLadder: [10, 50, 150, 450, 625, 750], houseCost: 100, hotelCost: 100, mortgage: 70 },
  { id: 'electric-company', index: 12, name: 'Electric Company', type: 'utility', colorGroup: 'utility', price: 150, rentLadder: utilityRent, mortgage: 75 },
  { id: 'states-avenue', index: 13, name: 'States Avenue', type: 'property', colorGroup: 'pink', price: 140, rentLadder: [10, 50, 150, 450, 625, 750], houseCost: 100, hotelCost: 100, mortgage: 70 },
  { id: 'virginia-avenue', index: 14, name: 'Virginia Avenue', type: 'property', colorGroup: 'pink', price: 160, rentLadder: [12, 60, 180, 500, 700, 900], houseCost: 100, hotelCost: 100, mortgage: 80 },
  { id: 'pennsylvania-railroad', index: 15, name: 'Pennsylvania Railroad', type: 'railroad', colorGroup: 'railroad', price: 200, rentLadder: railroadRent, mortgage: 100 },
  { id: 'st-james-place', index: 16, name: 'St. James Place', type: 'property', colorGroup: 'orange', price: 180, rentLadder: [14, 70, 200, 550, 750, 950], houseCost: 100, hotelCost: 100, mortgage: 90 },
  { id: 'community-chest-2', index: 17, name: 'Community Chest', type: 'community_chest' },
  { id: 'tennessee-avenue', index: 18, name: 'Tennessee Avenue', type: 'property', colorGroup: 'orange', price: 180, rentLadder: [14, 70, 200, 550, 750, 950], houseCost: 100, hotelCost: 100, mortgage: 90 },
  { id: 'new-york-avenue', index: 19, name: 'New York Avenue', type: 'property', colorGroup: 'orange', price: 200, rentLadder: [16, 80, 220, 600, 800, 1000], houseCost: 100, hotelCost: 100, mortgage: 100 },
  { id: 'free-parking', index: 20, name: 'Free Parking', type: 'free_parking' },
  { id: 'kentucky-avenue', index: 21, name: 'Kentucky Avenue', type: 'property', colorGroup: 'red', price: 220, rentLadder: [18, 90, 250, 700, 875, 1050], houseCost: 150, hotelCost: 150, mortgage: 110 },
  { id: 'chance-2', index: 22, name: 'Chance', type: 'chance' },
  { id: 'indiana-avenue', index: 23, name: 'Indiana Avenue', type: 'property', colorGroup: 'red', price: 220, rentLadder: [18, 90, 250, 700, 875, 1050], houseCost: 150, hotelCost: 150, mortgage: 110 },
  { id: 'illinois-avenue', index: 24, name: 'Illinois Avenue', type: 'property', colorGroup: 'red', price: 240, rentLadder: [20, 100, 300, 750, 925, 1100], houseCost: 150, hotelCost: 150, mortgage: 120 },
  { id: 'bo-railroad', index: 25, name: 'B. & O. Railroad', type: 'railroad', colorGroup: 'railroad', price: 200, rentLadder: railroadRent, mortgage: 100 },
  { id: 'atlantic-avenue', index: 26, name: 'Atlantic Avenue', type: 'property', colorGroup: 'yellow', price: 260, rentLadder: [22, 110, 330, 800, 975, 1150], houseCost: 150, hotelCost: 150, mortgage: 130 },
  { id: 'ventnor-avenue', index: 27, name: 'Ventnor Avenue', type: 'property', colorGroup: 'yellow', price: 260, rentLadder: [22, 110, 330, 800, 975, 1150], houseCost: 150, hotelCost: 150, mortgage: 130 },
  { id: 'water-works', index: 28, name: 'Water Works', type: 'utility', colorGroup: 'utility', price: 150, rentLadder: utilityRent, mortgage: 75 },
  { id: 'marvin-gardens', index: 29, name: 'Marvin Gardens', type: 'property', colorGroup: 'yellow', price: 280, rentLadder: [24, 120, 360, 850, 1025, 1200], houseCost: 150, hotelCost: 150, mortgage: 140 },
  { id: 'go-to-jail', index: 30, name: 'Go To Jail', type: 'go_to_jail' },
  { id: 'pacific-avenue', index: 31, name: 'Pacific Avenue', type: 'property', colorGroup: 'green', price: 300, rentLadder: [26, 130, 390, 900, 1100, 1275], houseCost: 200, hotelCost: 200, mortgage: 150 },
  { id: 'north-carolina-avenue', index: 32, name: 'North Carolina Avenue', type: 'property', colorGroup: 'green', price: 300, rentLadder: [26, 130, 390, 900, 1100, 1275], houseCost: 200, hotelCost: 200, mortgage: 150 },
  { id: 'community-chest-3', index: 33, name: 'Community Chest', type: 'community_chest' },
  { id: 'pennsylvania-avenue', index: 34, name: 'Pennsylvania Avenue', type: 'property', colorGroup: 'green', price: 320, rentLadder: [28, 150, 450, 1000, 1200, 1400], houseCost: 200, hotelCost: 200, mortgage: 160 },
  { id: 'short-line', index: 35, name: 'Short Line', type: 'railroad', colorGroup: 'railroad', price: 200, rentLadder: railroadRent, mortgage: 100 },
  { id: 'chance-3', index: 36, name: 'Chance', type: 'chance' },
  { id: 'park-place', index: 37, name: 'Park Place', type: 'property', colorGroup: 'dark-blue', price: 350, rentLadder: [35, 175, 500, 1100, 1300, 1500], houseCost: 200, hotelCost: 200, mortgage: 175 },
  { id: 'luxury-tax', index: 38, name: 'Luxury Tax', type: 'tax', tax: 100 },
  { id: 'boardwalk', index: 39, name: 'Boardwalk', type: 'property', colorGroup: 'dark-blue', price: 400, rentLadder: [50, 200, 600, 1400, 1700, 2000], houseCost: 200, hotelCost: 200, mortgage: 200 },
]

export const PROPERTY_IDS = BOARD.filter((tile) =>
  ['property', 'railroad', 'utility'].includes(tile.type),
).map((tile) => tile.id)

export const COLOR_GROUPS: Record<string, string[]> = PROPERTY_IDS.reduce<Record<string, string[]>>(
  (groups, id) => {
    const tile = BOARD.find((candidate) => candidate.id === id)
    if (!tile?.colorGroup) return groups
    groups[tile.colorGroup] = [...(groups[tile.colorGroup] ?? []), id]
    return groups
  },
  {},
)

export function getTile(propertyId: string): Tile | undefined {
  return BOARD.find((tile) => tile.id === propertyId)
}
