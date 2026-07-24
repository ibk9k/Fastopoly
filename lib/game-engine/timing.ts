/**
 * Every game clock, in one place.
 *
 * These were previously scattered as bare numbers across routes and components,
 * which is how the auction's on-screen "max" (30 s) and its anti-snipe extension
 * (10 s) drifted apart. Import from here rather than re-typing a literal.
 *
 * All values are milliseconds unless the name says otherwise. Deadlines derived
 * from them are stamped with the SERVER's clock; clients compare against
 * `serverNow()` (lib/game-client/server-time.ts), never their own `Date.now()`.
 */

/** Time to take a turn before it is auto-rolled on the player's behalf. */
export const TURN_TIMEOUT_MS = 25_000

/** Time a player in debt gets to liquidate before auto-bankruptcy. */
export const DEBT_TIMEOUT_MS = 80_000

/** Length of an auction from the moment it opens. */
export const AUCTION_DURATION_MS = 30_000

/**
 * Anti-sniping. Only a bid landing inside this final window touches the clock,
 * and it resets the clock to exactly this window — just enough for a counter-bid.
 *
 * Keep this well under AUCTION_DURATION_MS. Setting the two equal means EVERY bid
 * re-arms the full auction (the remaining time is always inside the window), so
 * an auction never ends while anyone keeps bidding.
 */
export const AUCTION_EXTENSION_MS = 5_000

/** Seconds remaining at which timer UI switches to the urgent (red) treatment. */
export const URGENT_THRESHOLD_SECONDS = 8
