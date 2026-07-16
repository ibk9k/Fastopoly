import { describe, expect, it } from 'vitest'
import { calculateRent } from '@/lib/game-engine/rent'
import { makeProperty, makePropertyMap } from './factories'

const OWNER = 'player-0'

describe('calculateRent — properties', () => {
  it('returns 0 for an unowned property', () => {
    const props = makePropertyMap()
    expect(calculateRent('mediterranean-avenue', props.get('mediterranean-avenue')!, props)).toBe(0)
  })

  it('returns 0 for a mortgaged property', () => {
    const props = makePropertyMap()
    const med = makeProperty('mediterranean-avenue', { ownerId: OWNER, mortgaged: true })
    props.set('mediterranean-avenue', med)
    expect(calculateRent('mediterranean-avenue', med, props)).toBe(0)
  })

  it('charges base rent when the owner does NOT hold the full color group', () => {
    const props = makePropertyMap()
    const med = makeProperty('mediterranean-avenue', { ownerId: OWNER })
    props.set('mediterranean-avenue', med) // baltic still unowned
    expect(calculateRent('mediterranean-avenue', med, props)).toBe(2) // ladder[0]
  })

  it('doubles undeveloped rent for a full-group monopoly', () => {
    const props = makePropertyMap()
    props.set('mediterranean-avenue', makeProperty('mediterranean-avenue', { ownerId: OWNER }))
    props.set('baltic-avenue', makeProperty('baltic-avenue', { ownerId: OWNER }))
    const med = props.get('mediterranean-avenue')!
    expect(calculateRent('mediterranean-avenue', med, props)).toBe(4) // 2 * 2
  })

  it('does NOT double once a house is built (uses the ladder index)', () => {
    const props = makePropertyMap()
    props.set('mediterranean-avenue', makeProperty('mediterranean-avenue', { ownerId: OWNER, houses: 1 }))
    props.set('baltic-avenue', makeProperty('baltic-avenue', { ownerId: OWNER }))
    const med = props.get('mediterranean-avenue')!
    expect(calculateRent('mediterranean-avenue', med, props)).toBe(10) // ladder[1], no x2
  })

  it('uses ladder index 5 for a hotel', () => {
    const props = makePropertyMap()
    const med = makeProperty('mediterranean-avenue', { ownerId: OWNER, hotels: 1 })
    props.set('mediterranean-avenue', med)
    expect(calculateRent('mediterranean-avenue', med, props)).toBe(250) // ladder[5]
  })
})

describe('calculateRent — railroads', () => {
  const railroads = ['reading-railroad', 'pennsylvania-railroad', 'bo-railroad', 'short-line']

  it.each([
    [1, 25],
    [2, 50],
    [3, 100],
    [4, 200],
  ])('charges %i-railroad rent of $%i', (owned, expected) => {
    const props = makePropertyMap()
    railroads.slice(0, owned).forEach((id) => props.set(id, makeProperty(id, { ownerId: OWNER })))
    expect(calculateRent('reading-railroad', props.get('reading-railroad')!, props)).toBe(expected)
  })
})

describe('calculateRent — utilities', () => {
  it('charges dice x4 with one utility', () => {
    const props = makePropertyMap()
    props.set('electric-company', makeProperty('electric-company', { ownerId: OWNER }))
    expect(calculateRent('electric-company', props.get('electric-company')!, props, 7)).toBe(28)
  })

  it('charges dice x10 with both utilities', () => {
    const props = makePropertyMap()
    props.set('electric-company', makeProperty('electric-company', { ownerId: OWNER }))
    props.set('water-works', makeProperty('water-works', { ownerId: OWNER }))
    expect(calculateRent('electric-company', props.get('electric-company')!, props, 7)).toBe(70)
  })
})
