'use client'

import { createClient, LiveList, LiveMap } from '@liveblocks/client'
import { createRoomContext } from '@liveblocks/react'

const client = createClient({
  authEndpoint: async (room) => {
    const username =
      typeof window === 'undefined'
        ? 'anonymous'
        : sessionStorage.getItem('fastopoly_username') ??
          localStorage.getItem('fastopoly_username') ??
          'anonymous'
    const response = await fetch('/api/liveblocks-auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room, username }),
    })
    return response.json() as Promise<{ token: string }>
  },
})

export type Player = {
  id: string
  username: string
  color: string
  token: string
  position: number
  cash: number
  properties: string[]
  inJail: boolean
  jailTurns: number
  isBankrupt: boolean
  getOutOfJailCards: number
  ownedColorGroups?: string[]
  hasBuiltHotel?: boolean
  bankruptciesCaused?: number
  /** Set true once this seat's HMAC token has been claimed (claim-once). Never holds the token itself. */
  tokenClaimed?: boolean
  /** Supabase auth uid that owns this seat — the identity stats are credited to,
   * and what lets the same user reclaim their seat from any device. */
  authUserId?: string
}

export type Property = {
  id: string
  ownerId: string | null
  houses: number
  hotels: number
  mortgaged: boolean
}

export type GamePhase =
  | 'lobby'
  | 'playing'
  | 'rolling'
  | 'landed'
  | 'buy_decision'
  | 'auction'
  | 'trade'
  | 'ended'

export type TradeOffer = {
  id: string
  fromPlayerId: string
  toPlayerId: string
  offeredProperties: string[]
  requestedProperties: string[]
  offeredCash: number
  requestedCash: number
  /** Get Out of Jail Free cards included by each side. */
  offeredJailCards?: number
  requestedJailCards?: number
  status: 'pending' | 'accepted' | 'rejected'
}

export type GameLogEntry = {
  id: string
  message: string
  timestamp: number
}

export type GameRules = {
  startingCash: number
  freeParkingJackpot: boolean
  auctionOnPass: boolean
  speedDie: boolean
  maxPlayers: number
}

export type AuctionBid = {
  playerId: string
  amount: number
  timestamp: number
}

export type DiceRollState = {
  d1: number
  d2: number
  timestamp: number
  /** Who rolled, and the tile the dice actually hit BEFORE any card/jail relocation.
   * Carried in the same storage write as the final position so clients can stage the
   * token on the landing tile first — an out-of-band event would race the delta. */
  playerId?: string
  landedOn?: number
}

type Presence = {
  username: string
  currentTile: number
  isMyTurn: boolean
  isReady: boolean
}

export type Storage = {
  gamePhase: GamePhase
  currentPlayerIndex: number
  players: LiveList<Player>
  properties: Record<string, Property>
  freeParkingPool: number
  chanceIndex: number
  communityChestIndex: number
  tradeOffer: TradeOffer | null
  log: LiveList<GameLogEntry>
  rules: GameRules
  mapType: string
  winnerIds: string[]
  houseSupply?: number
  hotelSupply?: number
  lastRollWasDoubles?: boolean
  /** Consecutive doubles rolled this turn — the third sends the roller to jail. */
  consecutiveDoubles?: number
  /** Epoch ms by which the current player must act, or their turn is auto-skipped. */
  turnDeadline?: number
  /** Set once final scores have been written to Supabase, so persistence is idempotent. */
  resultsPersisted?: boolean
  auctionPropertyId?: string | null
  auctionBids?: AuctionBid[]
  auctionHighestBid?: number
  auctionHighestBidderId?: string | null
  auctionEndTime?: number
  lastDiceRoll: DiceRollState
  hasRolled: boolean
}

export type JsonStorage = Omit<Storage, 'players' | 'properties' | 'log'> & {
  players: Player[]
  properties: Record<string, Property>
  log: GameLogEntry[]
  auctionPropertyId?: string | null
  auctionBids?: AuctionBid[]
  auctionHighestBid?: number
  auctionHighestBidderId?: string | null
  auctionEndTime?: number
}

export type RoomEvent =
  | { type: 'DICE_ROLLED'; playerId: string; dice: [number, number] }
  | { type: 'CARD_DRAWN'; playerId: string; cardType: 'chance' | 'community'; text: string }
  | { type: 'TRADE_OFFERED'; offer: TradeOffer }
  | { type: 'PLAYER_BANKRUPT'; playerId: string; creditorId: string | 'bank' }
  | { type: 'AUCTION_START'; propertyId: string; startingBid: number }
  | { type: 'SOUND'; sound: 'dice' | 'buy' | 'rent' | 'jail' | 'bankrupt' }

export const {
  RoomProvider,
  useMyPresence,
  useUpdateMyPresence,
  useStorage,
  useMutation,
  useOthers,
  useSelf,
  useBroadcastEvent,
  useEventListener,
  useRoom,
} = createRoomContext<Presence, Storage, never, RoomEvent>(client)
