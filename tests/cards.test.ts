import { describe, expect, it } from 'vitest'
import { CHANCE_CARDS, COMMUNITY_CHEST_CARDS } from '@/lib/game-engine/cards'

describe('card decks', () => {
  it('has 16 Chance and 16 Community Chest cards', () => {
    expect(CHANCE_CARDS).toHaveLength(16)
    expect(COMMUNITY_CHEST_CARDS).toHaveLength(16)
  })

  it('every card carries a typed action and non-empty text', () => {
    for (const card of [...CHANCE_CARDS, ...COMMUNITY_CHEST_CARDS]) {
      expect(card.text.length).toBeGreaterThan(0)
      expect(card.action.type).toBeTruthy()
    }
  })

  it('card ids are unique within the combined deck', () => {
    const ids = [...CHANCE_CARDS, ...COMMUNITY_CHEST_CARDS].map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('includes both a go-to-jail and a get-out-of-jail card in each deck', () => {
    for (const deck of [CHANCE_CARDS, COMMUNITY_CHEST_CARDS]) {
      expect(deck.some((c) => c.action.type === 'go_to_jail')).toBe(true)
      expect(deck.some((c) => c.action.type === 'get_out_of_jail')).toBe(true)
    }
  })
})
