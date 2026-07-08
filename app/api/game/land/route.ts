import { NextRequest, NextResponse } from 'next/server'
import { CHANCE_CARDS, COMMUNITY_CHEST_CARDS } from '@/lib/game-engine/cards'
import { assertGamePhase, assertIsActivePlayer } from '@/lib/game-engine/guards'
import { badRequest, routeError } from '@/lib/game-engine/route-utils'
import { addLog, broadcastRoomEvent, endTurn, handlePostLanding, mutateGameStorage } from '@/lib/game-engine/server-state'
import { activePlayer, applyCard, resolveLanding } from '@/lib/game-engine/actions'
import { BOARD } from '@/lib/game-engine/board'
import type { JsonStorage, Player, RoomEvent } from '@/lib/liveblocks.config'

type LandResult = ReturnType<typeof resolveLanding> | { action: 'card'; card: (typeof CHANCE_CARDS)[number] }

function inferCreditorId(storage: JsonStorage, player: Player): string | 'bank' {
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

export async function POST(req: NextRequest) {
  try {
    const { roomId, playerId, diceTotal } = (await req.json()) as { roomId?: string; playerId?: string; diceTotal?: number }
    if (!roomId || !playerId) return badRequest('Missing roomId or playerId')

    const events: RoomEvent[] = []
    const result = await mutateGameStorage(roomId, (storage) => {
      assertGamePhase(storage, ['landed', 'playing'])
      assertIsActivePlayer(storage, playerId)
      const player = activePlayer(storage)
      const tile = BOARD[player.position]
      const alreadyBankruptIds = new Set(storage.players.filter((candidate) => candidate.isBankrupt).map((candidate) => candidate.id))
      let result: LandResult

      if (tile.type === 'chance' || tile.type === 'community_chest') {
        const isChance = tile.type === 'chance'
        const cards = isChance ? CHANCE_CARDS : COMMUNITY_CHEST_CARDS
        const indexKey = isChance ? 'chanceIndex' : 'communityChestIndex'
        const card = cards[storage[indexKey] % cards.length]
        storage[indexKey] = (storage[indexKey] + 1) % cards.length
        applyCard(storage, player, card)
        addLog(storage, `${player.username} drew: ${card.text}`)
        events.push({ type: 'CARD_DRAWN', playerId, cardType: isChance ? 'chance' : 'community', text: card.text })

        if (player.inJail) {
          endTurn(storage)
          result = { action: 'card', card }
          queueBankruptcyEvents(storage, alreadyBankruptIds, events)
          return result
        }

        const afterCard = BOARD[player.position]
        if (afterCard.type === 'property' || afterCard.type === 'railroad' || afterCard.type === 'utility' || afterCard.type === 'tax' || afterCard.type === 'go_to_jail' || afterCard.type === 'free_parking') {
          result = resolveLanding(storage, player, diceTotal ?? 0)
          queueBankruptcyEvents(storage, alreadyBankruptIds, events)
          return result
        }
        handlePostLanding(storage)
        result = { action: 'card', card }
        queueBankruptcyEvents(storage, alreadyBankruptIds, events)
        return result
      }

      result = resolveLanding(storage, player, diceTotal ?? 0)
      queueBankruptcyEvents(storage, alreadyBankruptIds, events)
      return result
    })

    await Promise.all(events.map((event) => broadcastRoomEvent(roomId, event)))
    return NextResponse.json(result)
  } catch (error) {
    return routeError(error, 'Land failed')
  }
}
