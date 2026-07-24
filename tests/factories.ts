import type { GameRules, JsonStorage, Player, Property } from '@/lib/liveblocks.config'
import { PROPERTY_IDS } from '@/lib/game-engine/board'

export function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: 'player-0',
    username: 'Alice',
    color: '#ef4444',
    token: 'hat',
    position: 0,
    cash: 1500,
    properties: [],
    inJail: false,
    jailTurns: 0,
    isBankrupt: false,
    getOutOfJailCards: 0,
    ...overrides,
  }
}

export function makeProperty(id: string, overrides: Partial<Property> = {}): Property {
  return { id, ownerId: null, houses: 0, hotels: 0, mortgaged: false, ...overrides }
}

/** A fresh properties map with every board property unowned. */
export function makePropertyMap(): Map<string, Property> {
  return new Map(PROPERTY_IDS.map((id) => [id, makeProperty(id)]))
}

export function makeRules(overrides: Partial<GameRules> = {}): GameRules {
  return { startingCash: 1500, freeParkingJackpot: false, auctionOnPass: true, speedDie: false, maxPlayers: 4, ...overrides }
}

export function makeStorage(overrides: Partial<JsonStorage> = {}): JsonStorage {
  const players = overrides.players ?? [makePlayer()]
  const properties =
    overrides.properties ?? Object.fromEntries(PROPERTY_IDS.map((id) => [id, makeProperty(id)]))
  return {
    gamePhase: 'playing',
    currentPlayerIndex: 0,
    players,
    properties,
    freeParkingPool: 0,
    chanceIndex: 0,
    communityChestIndex: 0,
    tradeOffer: null,
    log: [],
    rules: makeRules(),
    mapType: 'classic',
    winnerIds: [],
    houseSupply: 32,
    hotelSupply: 12,
    lastRollWasDoubles: false,
    lastDiceRoll: { d1: 3, d2: 4, timestamp: 0 },
    auctionHighestBid: 0,
    auctionHighestBidderId: null,
    auctionEndTime: 0,
    hasRolled: false,
    ...overrides,
  }
}

/** Sum of every player's cash — used to assert money conservation. */
export function totalCash(players: Player[]): number {
  return players.reduce((sum, p) => sum + p.cash, 0)
}
