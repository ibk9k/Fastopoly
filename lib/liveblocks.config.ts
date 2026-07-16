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
  bank: number
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
