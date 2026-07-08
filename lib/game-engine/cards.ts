export type Card = {
  id: string
  text: string
  action: CardAction
}

export type CardAction =
  | { type: 'move_to'; tileIndex: number; collectGo: boolean }
  | { type: 'move_by'; steps: number }
  | { type: 'move_to_nearest'; tileType: 'railroad' | 'utility' }
  | { type: 'collect'; amount: number }
  | { type: 'pay'; amount: number }
  | { type: 'collect_from_players'; amount: number }
  | { type: 'pay_per_building'; houseCost: number; hotelCost: number }
  | { type: 'go_to_jail' }
  | { type: 'get_out_of_jail' }
  | { type: 'go_back'; steps: number }

function shuffle(cards: Card[]): Card[] {
  const copy = [...cards]
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1))
    ;[copy[index], copy[target]] = [copy[target], copy[index]]
  }
  return copy
}

const chance: Card[] = [
  { id: 'chance-advance-boardwalk', text: 'Advance to Boardwalk.', action: { type: 'move_to', tileIndex: 39, collectGo: false } },
  { id: 'chance-advance-go', text: 'Advance to Go. Collect $200.', action: { type: 'move_to', tileIndex: 0, collectGo: true } },
  { id: 'chance-advance-illinois', text: 'Advance to Illinois Avenue. If you pass Go, collect $200.', action: { type: 'move_to', tileIndex: 24, collectGo: true } },
  { id: 'chance-advance-st-charles', text: 'Advance to St. Charles Place. If you pass Go, collect $200.', action: { type: 'move_to', tileIndex: 11, collectGo: true } },
  { id: 'chance-nearest-railroad-1', text: 'Advance to the nearest Railroad.', action: { type: 'move_to_nearest', tileType: 'railroad' } },
  { id: 'chance-nearest-railroad-2', text: 'Advance to the nearest Railroad.', action: { type: 'move_to_nearest', tileType: 'railroad' } },
  { id: 'chance-nearest-utility', text: 'Advance token to nearest Utility.', action: { type: 'move_to_nearest', tileType: 'utility' } },
  { id: 'chance-bank-dividend', text: 'Bank pays you dividend of $50.', action: { type: 'collect', amount: 50 } },
  { id: 'chance-get-out-of-jail', text: 'Get Out of Jail Free.', action: { type: 'get_out_of_jail' } },
  { id: 'chance-go-back-three', text: 'Go back three spaces.', action: { type: 'go_back', steps: 3 } },
  { id: 'chance-go-to-jail', text: 'Go directly to Jail. Do not pass Go. Do not collect $200.', action: { type: 'go_to_jail' } },
  { id: 'chance-repairs', text: 'Make general repairs: $25 per house and $100 per hotel.', action: { type: 'pay_per_building', houseCost: 25, hotelCost: 100 } },
  { id: 'chance-speeding-fine', text: 'Speeding fine $15.', action: { type: 'pay', amount: 15 } },
  { id: 'chance-reading-railroad', text: 'Take a trip to Reading Railroad. If you pass Go, collect $200.', action: { type: 'move_to', tileIndex: 5, collectGo: true } },
  { id: 'chance-chairman', text: 'You have been elected Chairman of the Board. Pay each player $50.', action: { type: 'collect_from_players', amount: -50 } },
  { id: 'chance-building-loan', text: 'Your building loan matures. Collect $150.', action: { type: 'collect', amount: 150 } },
]

const communityChest: Card[] = [
  { id: 'chest-advance-go', text: 'Advance to Go. Collect $200.', action: { type: 'move_to', tileIndex: 0, collectGo: true } },
  { id: 'chest-bank-error', text: 'Bank error in your favor. Collect $200.', action: { type: 'collect', amount: 200 } },
  { id: 'chest-doctor-fee', text: "Doctor's fee. Pay $50.", action: { type: 'pay', amount: 50 } },
  { id: 'chest-stock-sale', text: 'From sale of stock you get $50.', action: { type: 'collect', amount: 50 } },
  { id: 'chest-get-out-of-jail', text: 'Get Out of Jail Free.', action: { type: 'get_out_of_jail' } },
  { id: 'chest-go-to-jail', text: 'Go directly to Jail. Do not pass Go. Do not collect $200.', action: { type: 'go_to_jail' } },
  { id: 'chest-holiday-fund', text: 'Holiday fund matures. Receive $100.', action: { type: 'collect', amount: 100 } },
  { id: 'chest-income-tax-refund', text: 'Income tax refund. Collect $20.', action: { type: 'collect', amount: 20 } },
  { id: 'chest-birthday', text: 'It is your birthday. Collect $10 from every player.', action: { type: 'collect_from_players', amount: 10 } },
  { id: 'chest-life-insurance', text: 'Life insurance matures. Collect $100.', action: { type: 'collect', amount: 100 } },
  { id: 'chest-hospital-fees', text: 'Pay hospital fees of $100.', action: { type: 'pay', amount: 100 } },
  { id: 'chest-school-fees', text: 'Pay school fees of $50.', action: { type: 'pay', amount: 50 } },
  { id: 'chest-consultancy', text: 'Receive $25 consultancy fee.', action: { type: 'collect', amount: 25 } },
  { id: 'chest-street-repairs', text: 'You are assessed for street repairs: $40 per house and $115 per hotel.', action: { type: 'pay_per_building', houseCost: 40, hotelCost: 115 } },
  { id: 'chest-beauty-contest', text: 'You have won second prize in a beauty contest. Collect $10.', action: { type: 'collect', amount: 10 } },
  { id: 'chest-inheritance', text: 'You inherit $100.', action: { type: 'collect', amount: 100 } },
]

export const CHANCE_CARDS = shuffle(chance)
export const COMMUNITY_CHEST_CARDS = shuffle(communityChest)
