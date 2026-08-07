import type { JsonStorage, Player } from '@/lib/liveblocks.config'
import { getTile } from './board'
import { addLog } from './server-state'
import { cancelOffersInvolving } from './trades'

/**
 * Executes a bankruptcy per the actual Monopoly rules:
 * - Buildings are sold back to the bank at half price; when a PLAYER is the
 *   creditor, those proceeds go to them.
 * - Properties transfer to a player-creditor with their mortgage flags intact
 *   (the 10% transfer interest is intentionally not modeled here), or return
 *   clean to the bank when the bank is the creditor.
 * - Get Out of Jail cards go to a player-creditor.
 * - The debtor's cash balance settles against the creditor. Rent is credited
 *   in full at landing time even when it drives the payer negative, so the
 *   negative balance here is exactly the uncovered part of that credit —
 *   adding it back to the creditor keeps total money conserved.
 */
export function executeBankruptcy(storage: JsonStorage, debtor: Player, creditorId: string | 'bank'): void {
  const creditor = creditorId === 'bank' ? null : storage.players.find((p) => p.id === creditorId) ?? null

  // A pending offer to or from a bankrupt player can never be settled — its assets
  // are about to change hands — so it is closed here rather than left sitting in
  // everyone's Active Trades list forever.
  storage.tradeOffers = cancelOffersInvolving(storage.tradeOffers ?? [], debtor.id)

  let buildingProceeds = 0
  debtor.properties.forEach((propertyId) => {
    const property = storage.properties[propertyId]
    const tile = getTile(propertyId)
    if (!property || !tile) return

    // Buildings always go back to the bank at half price.
    if (property.houses > 0) {
      buildingProceeds += Math.floor((property.houses * (tile.houseCost ?? 0)) / 2)
      storage.houseSupply = (storage.houseSupply ?? 32) + property.houses
      property.houses = 0
    }
    if (property.hotels > 0) {
      buildingProceeds += Math.floor((property.hotels * (tile.hotelCost ?? 0)) / 2)
      storage.hotelSupply = (storage.hotelSupply ?? 12) + property.hotels
      property.hotels = 0
    }

    if (creditor) {
      property.ownerId = creditor.id
      // Mortgage state carries over to the creditor.
    } else {
      property.ownerId = null
      property.mortgaged = false
    }
  })

  if (creditor) {
    creditor.properties = [...creditor.properties, ...debtor.properties]
    creditor.getOutOfJailCards += debtor.getOutOfJailCards
    // Settle cash: positive remainder transfers; a negative balance claws back
    // the part of the rent credit the debtor never actually covered.
    creditor.cash += buildingProceeds + debtor.cash
    creditor.bankruptciesCaused = (creditor.bankruptciesCaused ?? 0) + 1
    addLog(storage, `${debtor.username} went bankrupt — ${creditor.username} receives their assets.`)
  } else {
    addLog(storage, `${debtor.username} went bankrupt to the bank. Their properties return to the bank.`)
  }

  debtor.properties = []
  debtor.cash = 0
  debtor.getOutOfJailCards = 0
  debtor.isBankrupt = true
}
