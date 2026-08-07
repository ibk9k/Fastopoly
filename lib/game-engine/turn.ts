import type { JsonStorage, Player, RoomEvent } from '@/lib/liveblocks.config'
import { BOARD, getTile } from './board'
import { CHANCE_CARDS, COMMUNITY_CHEST_CARDS } from './cards'
import { activePlayer, applyCard, resolveLanding, sendToJail } from './actions'
import { executeBankruptcy } from './bankruptcy'
import { addLog, endTurn, handlePostLanding, propertyMap, refreshTurnDeadline, toPropertyRecord } from './server-state'

export type RollOutcome = {
  dice: [number, number]
  newPosition: number
  /** The tile the dice landed on BEFORE any card/jail relocation (for staged token animation). */
  landedOn: number
  passedGo: boolean
  action: string
  amount?: number
}

/** Best-effort creditor inference: whoever owns the tile the player sits on. */
export function inferCreditorId(storage: JsonStorage, player: Player): string | 'bank' {
  const tile = BOARD[player.position]
  if (tile.type !== 'property' && tile.type !== 'railroad' && tile.type !== 'utility') {
    return 'bank'
  }
  const ownerId = storage.properties[tile.id]?.ownerId
  return ownerId && ownerId !== player.id ? ownerId : 'bank'
}

function queueBankruptcyEvents(storage: JsonStorage, alreadyBankruptIds: Set<string>, events: RoomEvent[]): void {
  storage.players.forEach((player) => {
    if (!player.isBankrupt || alreadyBankruptIds.has(player.id)) return
    events.push({ type: 'PLAYER_BANKRUPT', playerId: player.id, creditorId: inferCreditorId(storage, player) })
  })
}

/**
 * Resolves whatever tile the player currently occupies, including Chance /
 * Community Chest draws and their follow-up movement. Extracted from the old
 * /api/game/land route so the roll can resolve its landing in the SAME
 * transaction (closes the land-replay, skip-rent, and stuck-`landed` bugs).
 */
export function resolveCurrentTile(
  storage: JsonStorage,
  player: Player,
  diceTotal: number,
  events: RoomEvent[],
): { action: string; amount?: number } {
  const alreadyBankruptIds = new Set(
    storage.players.filter((candidate) => candidate.isBankrupt).map((candidate) => candidate.id),
  )
  const tile = BOARD[player.position]

  try {
    if (tile.type === 'chance' || tile.type === 'community_chest') {
      const isChance = tile.type === 'chance'
      const cards = isChance ? CHANCE_CARDS : COMMUNITY_CHEST_CARDS
      const indexKey = isChance ? 'chanceIndex' : 'communityChestIndex'
      const card = cards[storage[indexKey] % cards.length]
      storage[indexKey] = (storage[indexKey] + 1) % cards.length
      applyCard(storage, player, card)
      addLog(storage, `${player.username} drew: ${card.text}`)
      events.push({ type: 'CARD_DRAWN', playerId: player.id, cardType: isChance ? 'chance' : 'community', text: card.text })

      if (player.inJail) {
        endTurn(storage)
        return { action: 'card' }
      }

      const afterCard = BOARD[player.position]
      if (
        afterCard.type === 'property' ||
        afterCard.type === 'railroad' ||
        afterCard.type === 'utility' ||
        afterCard.type === 'tax' ||
        afterCard.type === 'go_to_jail' ||
        afterCard.type === 'free_parking'
      ) {
        return resolveLanding(storage, player, diceTotal)
      }
      handlePostLanding(storage)
      return { action: 'card' }
    }

    return resolveLanding(storage, player, diceTotal)
  } finally {
    queueBankruptcyEvents(storage, alreadyBankruptIds, events)
  }
}

/**
 * The full roll: movement + landing resolution as ONE storage mutation.
 * Dice are injected so the pipeline is unit-testable. Handles passing Go,
 * doubles counting (3 consecutive → jail, turn forfeited), and the
 * Go-To-Jail tile suppressing the doubles re-roll.
 */
export function applyRoll(storage: JsonStorage, d1: number, d2: number, events: RoomEvent[]): RollOutcome {
  const player = activePlayer(storage)
  const isDoubles = d1 === d2

  storage.lastDiceRoll = { d1, d2, timestamp: Date.now(), playerId: player.id }
  storage.hasRolled = true
  storage.lastRollWasDoubles = isDoubles
  storage.consecutiveDoubles = isDoubles ? (storage.consecutiveDoubles ?? 0) + 1 : 0
  // Rolling earns a fresh window for the post-roll decisions (buy/build/end).
  refreshTurnDeadline(storage)

  if (isDoubles && (storage.consecutiveDoubles ?? 0) >= 3) {
    // No movement on the third doubles — stage on the tile they were standing on.
    const startPosition = player.position
    storage.lastDiceRoll.landedOn = startPosition
    storage.lastRollWasDoubles = false
    storage.consecutiveDoubles = 0
    sendToJail(player)
    addLog(storage, `${player.username} rolled three consecutive doubles and was sent to jail!`)
    endTurn(storage)
    return { dice: [d1, d2], newPosition: player.position, landedOn: startPosition, passedGo: false, action: 'jail' }
  }

  const total = d1 + d2
  const nextPosition = (player.position + total) % BOARD.length
  const passedGo = nextPosition < player.position
  player.position = nextPosition
  storage.lastDiceRoll.landedOn = nextPosition
  if (passedGo) player.cash += 200
  addLog(storage, `${player.username} rolled ${d1} and ${d2}.`)

  const result = resolveCurrentTile(storage, player, total, events)
  return { dice: [d1, d2], newPosition: player.position, landedOn: nextPosition, passedGo, ...result }
}

function defaultDice(): [number, number] {
  return [Math.floor(Math.random() * 6) + 1, Math.floor(Math.random() * 6) + 1]
}

/**
 * After an auto-roll, if it is still the same player's turn (the landing didn't
 * already jail them or end the game), close it out: an away player doesn't buy a
 * property. If auto-rolled rent left them insolvent (they can't liquidate while
 * away), declare bankruptcy so the game keeps moving.
 *
 * Doubles are the exception. They earn another roll, and being away does not
 * forfeit that — `endTurn` re-arms the same seat with a fresh deadline, so the
 * next timeout auto-rolls again instead of passing play on. This used to clear
 * the flag first, which turned every auto-rolled double into a skipped turn.
 * The loop is bounded: `applyRoll` jails on the third consecutive double.
 */
function autoEndTurn(storage: JsonStorage, startIndex: number): void {
  if (storage.gamePhase === 'ended') return
  // A go-to-jail / third-double landing already advanced the turn inside resolveLanding.
  if (storage.currentPlayerIndex !== startIndex) return

  const player = storage.players[startIndex]
  if (!player) return

  if (player.cash < 0 && !player.isBankrupt) {
    addLog(storage, `${player.username} could not cover the payment and went bankrupt.`)
    executeBankruptcy(storage, player, inferCreditorId(storage, player))
  }

  storage.gamePhase = 'playing'

  // A player the landing just bankrupted has no turn left to re-roll into, so
  // their doubles are dropped rather than handed to endTurn.
  const keepsDoubles = Boolean(storage.lastRollWasDoubles) && !player.isBankrupt
  if (!keepsDoubles) {
    storage.lastRollWasDoubles = false
    storage.consecutiveDoubles = 0
  }
  endTurn(storage)
}

/**
 * Auto-completes the current player's turn once their deadline passes, so an
 * absent player can never stall the game. Rather than skipping (which unfairly
 * denies them their movement and any Go money), it AUTO-ROLLS on their behalf,
 * resolves the landing, and passes any buy decision. Any seated peer triggers
 * this; the server clock decides and the transaction is idempotent. Returns
 * false when there is nothing to enforce yet.
 */
export function enforceTurnTimeout(
  storage: JsonStorage,
  events: RoomEvent[] = [],
  rollDice: () => [number, number] = defaultDice,
): boolean {
  if (storage.gamePhase === 'lobby' || storage.gamePhase === 'ended' || storage.gamePhase === 'auction') {
    return false
  }
  const deadline = storage.turnDeadline ?? 0
  // Allow a 1000ms grace window for client/server clock skew
  if (deadline === 0 || Date.now() + 1000 < deadline) return false

  const player = storage.players[storage.currentPlayerIndex]
  if (!player) return false
  const startIndex = storage.currentPlayerIndex

  // Already in debt (owed rent they never covered) — an away player can't liquidate.
  if (player.cash < 0 && !player.isBankrupt) {
    addLog(storage, `${player.username} ran out of time in debt and was declared bankrupt.`)
    executeBankruptcy(storage, player, inferCreditorId(storage, player))
    storage.lastRollWasDoubles = false
    endTurn(storage)
    return true
  }

  // Jailed and hasn't taken a jail action → auto-attempt the jail roll.
  if (player.inJail && !storage.hasRolled) {
    const [d1, d2] = rollDice()
    const total = d1 + d2
    storage.lastDiceRoll = { d1, d2, timestamp: Date.now(), playerId: player.id }
    storage.hasRolled = true
    storage.lastRollWasDoubles = false
    storage.consecutiveDoubles = 0
    events.push({ type: 'DICE_ROLLED', playerId: player.id, dice: [d1, d2] })

    const leaveJailAndMove = (message: string) => {
      player.inJail = false
      player.jailTurns = 0
      player.position = (player.position + total) % BOARD.length
      storage.lastDiceRoll.landedOn = player.position
      addLog(storage, message)
      resolveCurrentTile(storage, player, total, events)
      autoEndTurn(storage, startIndex)
    }

    if (d1 === d2) {
      leaveJailAndMove(`${player.username} (away) rolled doubles and left jail.`)
    } else {
      player.jailTurns += 1
      if (player.jailTurns >= 3) {
        player.cash -= 50
        leaveJailAndMove(`${player.username} (away) served their time, paid $50, and moved on.`)
      } else {
        addLog(storage, `${player.username} (away) failed to roll doubles in jail (${d1} and ${d2}).`)
        endTurn(storage)
      }
    }
    return true
  }

  // Not rolled yet → roll for them, resolve the landing, then end the turn.
  if (!storage.hasRolled) {
    const [d1, d2] = rollDice()
    events.push({ type: 'DICE_ROLLED', playerId: player.id, dice: [d1, d2] })
    addLog(storage, `${player.username} ran out of time — rolling automatically.`)
    applyRoll(storage, d1, d2, events)
    autoEndTurn(storage, startIndex)
    return true
  }

  // Already rolled but idling on a decision (buy/build) → pass it and end the turn.
  addLog(storage, `${player.username} ran out of time — turn ended.`)
  storage.gamePhase = 'playing'
  storage.lastRollWasDoubles = false
  storage.consecutiveDoubles = 0
  endTurn(storage)
  return true
}

/**
 * Idempotently resolves an expired auction. Callable by ANY seated player —
 * the old design elected the lowest-connectionId client, which stalled the
 * auction forever if that client disconnected. Returns false when there was
 * nothing to resolve (not in auction / timer still running).
 */
export function resolveExpiredAuction(storage: JsonStorage, graceMs = 500): boolean {
  if (storage.gamePhase !== 'auction') return false

  const propertyId = storage.auctionPropertyId
  if (!propertyId) throw new Error('No auction property set')

  const tile = getTile(propertyId)
  const properties = propertyMap(storage.properties)
  const property = properties.get(propertyId)
  if (!tile || !property) throw new Error('Invalid property')

  const endTime = storage.auctionEndTime ?? 0
  if (Date.now() < endTime - graceMs) {
    throw new Error('Auction is still in progress')
  }

  const winnerId = storage.auctionHighestBidderId
  const finalBidAmount = storage.auctionHighestBid ?? 0

  if (winnerId) {
    const winnerPlayer = storage.players.find((p) => p.id === winnerId)
    if (!winnerPlayer) throw new Error('Winner player not found')
    if (winnerPlayer.cash < finalBidAmount) {
      throw new Error(`Winner ${winnerPlayer.username} does not have enough cash to complete purchase`)
    }
    winnerPlayer.cash -= finalBidAmount
    property.ownerId = winnerPlayer.id
    winnerPlayer.properties = [...winnerPlayer.properties, propertyId]
    storage.properties = toPropertyRecord(properties)
    addLog(storage, `Auction complete! ${winnerPlayer.username} won ${tile.name} for $${finalBidAmount}.`)
  } else {
    addLog(storage, `Auction complete! ${tile.name} had no bids and remains unowned.`)
  }

  storage.auctionPropertyId = null
  storage.auctionHighestBid = 0
  storage.auctionHighestBidderId = null
  storage.auctionEndTime = 0
  storage.auctionBids = []

  handlePostLanding(storage)
  return true
}
