'use client'

import { createClient, LiveList, LiveMap } from '@liveblocks/client'
import { createRoomContext } from '@liveblocks/react'

const client = createClient({
  // The endpoint derives identity from the session cookie; sending a username here
  // would be decorative at best and spoofable at worst.
  authEndpoint: async (room) => {
    const response = await fetch('/api/liveblocks-auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room }),
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

/**
 * `countered` is terminal like accepted/rejected: editing an offer closes it and
 * opens a fresh one pointing back at it, so a negotiation is a chain of offers
 * rather than one mutable record. That keeps the accept path validating exactly
 * the terms the accepting player was shown.
 */
export type TradeStatus = 'pending' | 'accepted' | 'rejected' | 'countered' | 'cancelled'

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
  status: TradeStatus
  createdAt?: number
  /** The offer this one counters, if any — the link that forms the chain. */
  counterOfId?: string | null
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

export type ChatMessage = {
  id: string
  /** Supabase auth uid — the durable identity. Seat ids change every reconnect. */
  authorId: string
  /** Display name captured at send time, so history survives a rename. */
  username: string
  /** Seat colour when the author held a seat, for the same reason. */
  color?: string
  text: string
  timestamp: number
}

export type Storage = {
  gamePhase: GamePhase
  currentPlayerIndex: number
  players: LiveList<Player>
  properties: Record<string, Property>
  freeParkingPool: number
  chanceIndex: number
  communityChestIndex: number
  /** @deprecated Single-offer slot, replaced by `tradeOffers`. Kept so documents
   * seeded before the change still normalize. */
  tradeOffer: TradeOffer | null
  /** Every offer in the room, newest last. Terminal ones are pruned on write. */
  tradeOffers?: TradeOffer[]
  log: LiveList<GameLogEntry>
  /** Player chat. Optional so rooms seeded before chat existed still load. */
  messages?: ChatMessage[]
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
  /** Epoch ms until which auto-enforcement of the turn timer is locked out.
   * Stamped inside the same transaction as the enforcement itself, so the guard
   * survives across serverless instances (an in-process lock would not). */
  enforcementLockUntil?: number
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
  // No SOUND event on purpose: a broadcast can arrive before or after the storage
  // delta that visually explains it (the same race that used to teleport tokens).
  // Cues are played client-side off the rendered state — see lib/game-client/audio.ts.

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
