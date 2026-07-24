import { Liveblocks } from '@liveblocks/node'
import { nanoid } from 'nanoid'
import type { GameLogEntry, GameRules, JsonStorage, Player, Property } from '@/lib/liveblocks.config'
import { PROPERTY_IDS } from './board'

type StorageRoot = {
  set: (key: keyof JsonStorage | string, value: unknown) => void
  toImmutable: () => unknown
}

type LiveblocksStorageClient = {
  getStorageDocument: (roomId: string, format: 'json') => Promise<JsonStorage | null>
  initializeStorageDocument: (roomId: string, document: unknown) => Promise<unknown>
  createRoom: (roomId: string, params: { defaultAccesses: string[] }) => Promise<unknown>
  deleteRoom?: (roomId: string) => Promise<unknown>
  mutateStorage: (roomId: string, callback: (context: { root: StorageRoot }) => void | Promise<void>) => Promise<void>
  broadcastEvent?: (roomId: string, event: unknown) => Promise<void>
}

let liveblocksServer: LiveblocksStorageClient | null = null

export function getLiveblocksServer(): LiveblocksStorageClient {
  const secret = process.env.LIVEBLOCKS_SECRET_KEY
  if (!secret) throw new Error('LIVEBLOCKS_SECRET_KEY is not configured')

  liveblocksServer ??= new Liveblocks({
    secret,
  }) as unknown as LiveblocksStorageClient

  return liveblocksServer
}

export function liveblocksRoomId(roomId: string): string {
  return roomId.startsWith('fastopoly-') ? roomId : `fastopoly-${roomId}`
}

export function emptyStorage(rules?: GameRules, mapType = 'classic'): JsonStorage {
  return {
    gamePhase: 'lobby',
    currentPlayerIndex: 0,
    players: [],
    properties: {},
    freeParkingPool: 0,
    chanceIndex: 0,
    communityChestIndex: 0,
    tradeOffer: null,
    log: [],
    rules: rules ?? { startingCash: 1500, freeParkingJackpot: false, auctionOnPass: true, speedDie: false, maxPlayers: 4 },
    mapType,
    winnerIds: [],
    houseSupply: 32,
    hotelSupply: 12,
    lastRollWasDoubles: false,
    consecutiveDoubles: 0,
    lastDiceRoll: { d1: 3, d2: 4, timestamp: 0 },
    auctionHighestBid: 0,
    auctionHighestBidderId: null,
    auctionEndTime: 0,
    hasRolled: false,
  }
}

export function initialProperties(): Record<string, Property> {
  return Object.fromEntries(
    PROPERTY_IDS.map((id) => [id, { id, ownerId: null, houses: 0, hotels: 0, mortgaged: false }]),
  )
}

export async function readGameStorage(roomId: string): Promise<JsonStorage> {
  const storage = await getLiveblocksServer().getStorageDocument(liveblocksRoomId(roomId), 'json')
  if (!storage) throw new Error('Room storage not found')
  return {
    ...emptyStorage(storage.rules, storage.mapType),
    ...storage,
    players: storage.players ?? [],
    properties: storage.properties ?? {},
    log: storage.log ?? [],
  }
}

export async function initializeGameStorage(roomId: string, storage: JsonStorage): Promise<void> {
  await getLiveblocksServer().initializeStorageDocument(liveblocksRoomId(roomId), storage)
}

/**
 * Server-seeds a fresh room's Liveblocks storage at creation time, so clients never
 * need write access to bootstrap it (a prerequisite for READ_ACCESS — see Phase 2B).
 * Uses the documented createRoom + initializeStorageDocument (LSON) path. `players` and
 * `log` are LiveLists; everything else is plain JSON. Safe here because no user is
 * connected yet at creation (initializeStorageDocument would otherwise disconnect them).
 */
export async function seedLobbyStorage(roomId: string, rules: GameRules, mapType = 'classic'): Promise<void> {
  const client = getLiveblocksServer()
  const rid = liveblocksRoomId(roomId)

  try {
    await client.createRoom(rid, { defaultAccesses: [] })
  } catch {
    // Room may already exist (e.g. a retry) — initializeStorageDocument below still guards emptiness.
  }

  const document = {
    liveblocksType: 'LiveObject',
    data: {
      gamePhase: 'lobby',
      currentPlayerIndex: 0,
      players: { liveblocksType: 'LiveList', data: [] },
      properties: {},
      freeParkingPool: 0,
      chanceIndex: 0,
      communityChestIndex: 0,
      tradeOffer: null,
      log: { liveblocksType: 'LiveList', data: [] },
      rules: { ...rules },
      mapType,
      winnerIds: [],
      houseSupply: 32,
      hotelSupply: 12,
      lastRollWasDoubles: false,
      consecutiveDoubles: 0,
      lastDiceRoll: { d1: 3, d2: 4, timestamp: 0 },
      auctionHighestBid: 0,
      auctionHighestBidderId: null,
      auctionEndTime: 0,
      hasRolled: false,
    },
  }

  await client.initializeStorageDocument(rid, document)
}

export async function writeGameStorage(roomId: string, storage: JsonStorage, keys?: string[]): Promise<void> {
  await getLiveblocksServer().mutateStorage(liveblocksRoomId(roomId), ({ root }) => {
    const keysToWrite = keys ?? Object.keys(storage)
    keysToWrite.forEach((key) => {
      root.set(key, (storage as any)[key])
    })
  })
}

/**
 * Runs a plain-object mutator against the room's storage ATOMICALLY: the read,
 * mutation, and write all happen inside a single Liveblocks `mutateStorage`
 * transaction, so concurrent requests serialize instead of clobbering each other
 * (the previous implementation was a separate read-then-write and lost updates).
 *
 * The mutator works on a normalized `JsonStorage` clone; only top-level keys that
 * actually changed are written back. A mutator may return `{ skipWrite: true }`
 * (reserved key) to suppress the write.
 */
export async function mutateGameStorage<T extends Record<string, any> | void>(
  roomId: string,
  mutator: (storage: JsonStorage) => T | Promise<T>,
): Promise<T> {
  let result!: T
  await getLiveblocksServer().mutateStorage(liveblocksRoomId(roomId), async ({ root }) => {
    const raw = root.toImmutable() as Partial<JsonStorage> | null
    const snapshot = raw ?? {}
    const storage: JsonStorage = JSON.parse(
      JSON.stringify({
        ...emptyStorage(snapshot.rules, snapshot.mapType),
        ...snapshot,
        players: snapshot.players ?? [],
        properties: snapshot.properties ?? {},
        log: snapshot.log ?? [],
      }),
    )

    const before: Record<string, string> = {}
    Object.entries(storage).forEach(([key, value]) => {
      before[key] = JSON.stringify(value)
    })

    result = await mutator(storage)

    // 'skipWrite' is a reserved key across all mutateGameStorage callers to prevent redundant writes
    const skipWrite =
      result && typeof result === 'object' && 'skipWrite' in result && (result as any).skipWrite === true
    if (skipWrite) return

    Object.entries(storage).forEach(([key, value]) => {
      if (before[key] !== JSON.stringify(value)) {
        root.set(key, value)
      }
    })
  })
  return result
}

export async function broadcastRoomEvent(roomId: string, event: unknown): Promise<void> {
  const server = getLiveblocksServer()
  if (server.broadcastEvent) {
    await server.broadcastEvent(liveblocksRoomId(roomId), event)
  }
}

export function addLog(storage: JsonStorage, message: string): void {
  const entry: GameLogEntry = { id: nanoid(), message, timestamp: Date.now() }
  storage.log = [...storage.log, entry]
}

export function playerMap(players: Player[]): Map<string, Player> {
  return new Map(players.map((player) => [player.id, player]))
}

export function propertyMap(properties: Record<string, Property>): Map<string, Property> {
  return new Map(Object.entries(properties))
}

/** How long the current player has to roll/act before any peer auto-plays for them. */
export const TURN_TIMEOUT_MS = 25_000
/** A player who has gone into debt gets a longer window (1 min 20 s) to raise funds
 * or declare bankruptcy before they are auto-bankrupted. */
export const DEBT_TIMEOUT_MS = 80_000

export function refreshTurnDeadline(storage: JsonStorage): void {
  const active = storage.players[storage.currentPlayerIndex]
  const inDebt = Boolean(active && active.cash < 0 && !active.isBankrupt)
  storage.turnDeadline = Date.now() + (inDebt ? DEBT_TIMEOUT_MS : TURN_TIMEOUT_MS)
}

export function endTurn(storage: JsonStorage): void {
  const activePlayers = storage.players.filter((player) => !player.isBankrupt)
  if (activePlayers.length <= 1) {
    storage.gamePhase = 'ended'
    storage.winnerIds = activePlayers.map((player) => player.id)
    return
  }

  // If the active player is in debt, keep them active so they must resolve it
  const currentPlayer = storage.players[storage.currentPlayerIndex]
  if (currentPlayer && currentPlayer.cash < 0 && !currentPlayer.isBankrupt) {
    storage.gamePhase = 'playing'
    refreshTurnDeadline(storage)
    addLog(storage, `${currentPlayer.username} is in debt and must raise funds or declare bankruptcy.`)
    return
  }

  // Doubles grant another roll — but never for a player who was just jailed
  // (going to jail forfeits the rest of the turn, even on doubles).
  if (storage.lastRollWasDoubles && !currentPlayer?.inJail) {
    storage.lastRollWasDoubles = false
    const activePlayer = storage.players[storage.currentPlayerIndex]
    if (activePlayer) {
      addLog(storage, `${activePlayer.username} gets another roll for rolling doubles!`)
    }
    storage.gamePhase = 'playing'
    storage.hasRolled = false
    refreshTurnDeadline(storage)
    return
  }
  storage.lastRollWasDoubles = false

  let nextIndex = storage.currentPlayerIndex
  for (let attempt = 0; attempt < storage.players.length; attempt += 1) {
    nextIndex = (nextIndex + 1) % storage.players.length
    if (!storage.players[nextIndex]?.isBankrupt) break
  }

  storage.currentPlayerIndex = nextIndex
  storage.gamePhase = 'playing'
  storage.hasRolled = false
  storage.consecutiveDoubles = 0
  refreshTurnDeadline(storage)
}

export function handlePostLanding(storage: JsonStorage): void {
  const activePlayer = storage.players[storage.currentPlayerIndex]
  if (storage.lastRollWasDoubles && !activePlayer?.inJail) {
    storage.lastRollWasDoubles = false
    storage.hasRolled = false
    if (activePlayer) {
      addLog(storage, `${activePlayer.username} gets another roll for rolling doubles!`)
    }
  }
  storage.gamePhase = 'playing'
  // Recompute the deadline now the landing is resolved: a player driven into debt
  // by rent/tax earns the longer debt window before auto-bankruptcy.
  refreshTurnDeadline(storage)
}

export function toPropertyRecord(properties: Map<string, Property>): Record<string, Property> {
  return Object.fromEntries(properties.entries())
}
