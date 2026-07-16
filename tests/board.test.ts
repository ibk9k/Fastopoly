import { describe, expect, it } from 'vitest'
import { BOARD, COLOR_GROUPS, PROPERTY_IDS, getTile } from '@/lib/game-engine/board'

describe('board layout', () => {
  it('has 40 tiles indexed 0..39 in order', () => {
    expect(BOARD).toHaveLength(40)
    BOARD.forEach((tile, index) => expect(tile.index).toBe(index))
  })

  it('places the canonical corners', () => {
    expect(BOARD[0].type).toBe('go')
    expect(BOARD[10].type).toBe('jail')
    expect(BOARD[20].type).toBe('free_parking')
    expect(BOARD[30].type).toBe('go_to_jail')
  })

  it('derives PROPERTY_IDS as all buyable tiles (22 colored + 4 rail + 2 utility = 28)', () => {
    expect(PROPERTY_IDS).toHaveLength(28)
    expect(PROPERTY_IDS).toContain('boardwalk')
    expect(PROPERTY_IDS).not.toContain('go')
  })

  it('groups colors correctly', () => {
    expect(COLOR_GROUPS.brown).toEqual(['mediterranean-avenue', 'baltic-avenue'])
    expect(COLOR_GROUPS.railroad).toHaveLength(4)
    expect(COLOR_GROUPS.utility).toHaveLength(2)
    expect(COLOR_GROUPS['dark-blue']).toEqual(['park-place', 'boardwalk'])
  })

  it('getTile resolves by id and returns undefined for unknown ids', () => {
    expect(getTile('boardwalk')?.price).toBe(400)
    expect(getTile('nope')).toBeUndefined()
  })
})
