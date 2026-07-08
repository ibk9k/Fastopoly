import type { Card } from './cards'
import type { JsonStorage, Player, Property } from '@/lib/liveblocks.config'
import { BOARD, COLOR_GROUPS, getTile } from './board'
import { addLog, endTurn, handlePostLanding, propertyMap, toPropertyRecord } from './server-state'
import { calculateRent } from './rent'

export function activePlayer(storage: JsonStorage): Player {
  const player = storage.players[storage.currentPlayerIndex]
  if (!player) throw new Error('Active player not found')
  return player
}

export function payPlayer(storage: JsonStorage, payer: Player, receiver: Player | null, amount: number): void {
  payer.cash -= amount
  if (receiver) receiver.cash += amount
  if (!receiver && storage.rules.freeParkingJackpot) {
    storage.freeParkingPool += amount
  }
}

export function movePlayer(player: Player, targetIndex: number, collectGo: boolean): boolean {
  const passedGo = collectGo && targetIndex < player.position
  player.position = targetIndex
  if (passedGo || (collectGo && targetIndex === 0)) {
    player.cash += 200
  }
  return passedGo
}

export function moveBy(player: Player, steps: number): boolean {
  const nextPosition = (player.position + steps + BOARD.length) % BOARD.length
  const passedGo = steps > 0 && nextPosition < player.position
  player.position = nextPosition
  if (passedGo) player.cash += 200
  return passedGo
}

export function nearestTileIndex(fromIndex: number, type: 'railroad' | 'utility'): number {
  for (let offset = 1; offset <= BOARD.length; offset += 1) {
    const tile = BOARD[(fromIndex + offset) % BOARD.length]
    if (tile.type === type) return tile.index
  }
  return fromIndex
}

export function sendToJail(player: Player): void {
  player.position = 10
  player.inJail = true
  player.jailTurns = 0
}

export function applyCard(storage: JsonStorage, player: Player, card: Card): { followUpTile?: boolean } {
  switch (card.action.type) {
    case 'move_to':
      movePlayer(player, card.action.tileIndex, card.action.collectGo)
      return { followUpTile: true }
    case 'move_by':
      moveBy(player, card.action.steps)
      return { followUpTile: true }
    case 'go_back':
      moveBy(player, -card.action.steps)
      return { followUpTile: true }
    case 'move_to_nearest':
      movePlayer(player, nearestTileIndex(player.position, card.action.tileType), true)
      return { followUpTile: true }
    case 'collect':
      player.cash += card.action.amount
      return {}
    case 'pay':
      payPlayer(storage, player, null, card.action.amount)
      return {}
    case 'collect_from_players':
      const playerAmount = card.action.amount
      storage.players.forEach((other) => {
        if (other.id === player.id || other.isBankrupt) return
        if (playerAmount >= 0) {
          other.cash -= playerAmount
          player.cash += playerAmount
        } else {
          const amount = Math.abs(playerAmount)
          player.cash -= amount
          other.cash += amount
        }
      })
      return {}
    case 'pay_per_building': {
      const houseCost = card.action.houseCost
      const hotelCost = card.action.hotelCost
      const properties = propertyMap(storage.properties)
      const amount = player.properties.reduce((total, propertyId) => {
        const property = properties.get(propertyId)
        if (!property) return total
        return total + property.houses * houseCost + property.hotels * hotelCost
      }, 0)
      payPlayer(storage, player, null, amount)
      return {}
    }
    case 'go_to_jail':
      sendToJail(player)
      return {}
    case 'get_out_of_jail':
      player.getOutOfJailCards += 1
      return {}
  }
}

export function resolveLanding(storage: JsonStorage, player: Player, diceTotal = 0): { action: string; amount?: number; property?: unknown } {
  const tile = BOARD[player.position]
  const properties = propertyMap(storage.properties)

  if (tile.type === 'go' || tile.type === 'jail') {
    handlePostLanding(storage)
    return { action: 'nothing' }
  }

  if (tile.type === 'go_to_jail') {
    sendToJail(player)
    addLog(storage, `${player.username} went to jail.`)
    endTurn(storage)
    return { action: 'jail' }
  }

  if (tile.type === 'free_parking') {
    if (storage.rules.freeParkingJackpot && storage.freeParkingPool > 0) {
      player.cash += storage.freeParkingPool
      addLog(storage, `${player.username} collected $${storage.freeParkingPool} from Free Parking.`)
      storage.freeParkingPool = 0
    }
    handlePostLanding(storage)
    return { action: 'free_parking' }
  }

  if (tile.type === 'tax') {
    const tax = tile.tax ?? 0
    payPlayer(storage, player, null, tax)
    addLog(storage, `${player.username} paid $${tax} in tax.`)
    handlePostLanding(storage)
    return { action: 'tax', amount: tax }
  }

  if (tile.type === 'property' || tile.type === 'railroad' || tile.type === 'utility') {
    const property = properties.get(tile.id)
    if (!property) throw new Error('Property state missing')

    if (!property.ownerId) {
      storage.gamePhase = 'buy_decision'
      return { action: 'can_buy', property: tile }
    }

    if (property.ownerId === player.id || property.mortgaged) {
      handlePostLanding(storage)
      return { action: 'nothing' }
    }

    const owner = storage.players.find((candidate) => candidate.id === property.ownerId)
    if (!owner) throw new Error('Property owner not found')
    const rent = calculateRent(tile.id, property, properties, diceTotal)
    payPlayer(storage, player, owner, rent)
    addLog(storage, `${player.username} paid $${rent} rent to ${owner.username}.`)
    storage.properties = toPropertyRecord(properties)
    handlePostLanding(storage)
    return { action: 'paid_rent', amount: rent }
  }

  handlePostLanding(storage)
  return { action: tile.type }
}

export function hasFullColorGroup(playerId: string, propertyId: string, properties: Map<string, Property>): boolean {
  const tile = getTile(propertyId)
  if (!tile?.colorGroup || tile.colorGroup === 'railroad' || tile.colorGroup === 'utility') return false
  return (COLOR_GROUPS[tile.colorGroup] ?? []).every((id) => properties.get(id)?.ownerId === playerId)
}
