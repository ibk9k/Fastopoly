# CLAUDE.md — Fastopoly

Reference for working in this repo. Read the "Known Pitfalls" and "Trust Model" sections before touching game logic — several severe issues are load-bearing and easy to reintroduce.

## What this is

**Fastopoly** — a real-time multiplayer Monopoly clone. Next.js 14 (App Router) + TypeScript (strict) + Tailwind, with **Liveblocks** for real-time state and **Supabase** for the room directory + leaderboard. 3D dice via react-three-fiber.

An overhaul is in progress. The full roadmap lives at `C:\Users\Popo\.claude\plans\alright-i-need-you-staged-possum.md`. Direction: **security-first**, keep the **cream/green** visual identity, target **public deployment**.

## Commands

```bash
npm run dev        # next dev — local server at http://localhost:3000
npm run build      # next build
npm run start      # next start (prod)
npm run typecheck  # tsc --noEmit  (strict)
npm run lint       # next lint (bare next/core-web-vitals)
npm run test       # vitest run   (added in Phase 1; engine unit tests)
```

Requires Node 18+. Needs a `.env.local` (see below) — the app throws without `LIVEBLOCKS_SECRET_KEY`, and Supabase-backed features (lobby list, leaderboard) fail without Supabase keys.

## Environment variables

```ini
NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_KEY=   # client
LIVEBLOCKS_SECRET_KEY=               # server (Liveblocks Node SDK + auth route)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=       # browser reads (public_rooms, users)
SUPABASE_SERVICE_ROLE_KEY=           # server writes (bypasses RLS)
# GAME_TOKEN_SECRET=                 # planned (Phase 2) HMAC player-token secret
```

`.env.local` is gitignored (correct). Only `.env.example` is tracked.

## Architecture

### State ownership
- **Liveblocks Storage** is the authoritative game state — one document per room, id `fastopoly-${roomCode}` (see `liveblocksRoomId()` in `lib/game-engine/server-state.ts`). Schema = `Storage` / `JsonStorage` in `lib/liveblocks.config.ts`.
- **Liveblocks Presence** carries transient per-connection UI state: `{ username, currentTile, isMyTurn, isReady }`.
- **Supabase** holds only durable/meta data — `public_rooms` (lobby directory), `users` + `game_results` (leaderboard). Schema: `lib/supabase/schema.sql`.

### Request flow
Clients **do not** mutate game logic directly (by design). They POST to Next.js route handlers under `app/api/game/*`, which read → mutate → write the Liveblocks Storage document server-side via the Liveblocks Node SDK. Liveblocks fans the storage delta to all connected clients over WebSocket; React components re-render from `useStorage`. Some routes also `broadcastRoomEvent` transient `RoomEvent`s (dice, card, bankrupt, trade) consumed via `useEventListener`.

```
Browser ──POST /api/game/*──▶ route handler ──Liveblocks Node SDK──▶ Storage doc
                                                                          │
Browser ◀────────────── WebSocket storage delta ◀─────────────────────────┘
```

### Server-state helpers (`lib/game-engine/server-state.ts`)
- `readGameStorage(roomId)` — REST read of the JSON snapshot, backfilled with `emptyStorage()` defaults.
- `writeGameStorage(roomId, storage, keys?)` — writes given top-level keys back via `mutateStorage`.
- **`mutateGameStorage(roomId, mutator)`** — read → run `(storage: JsonStorage) => T` mutator → JSON-diff each top-level key → write only changed keys. **Non-atomic** (separate read and write calls). Used by nearly every route. A mutator may return `{ skipWrite: true }` to suppress the write.
- **`transactionalMutate(roomId, mutator)`** — runs the mutator inside a single `mutateStorage` callback against the LiveObject `root` (atomic). Currently only `buy` uses it.
- `endTurn(storage)` / `handlePostLanding(storage)` — turn-progression state machine (doubles, debt-limbo, win check).
- `addLog`, `playerMap`, `propertyMap`, `toPropertyRecord` — utilities.

### Pure game engine (`lib/game-engine/`) — mostly pure functions over `JsonStorage`
- `board.ts` — `BOARD` (40 tiles, US rent ladders/costs/mortgages), `PROPERTY_IDS`, `COLOR_GROUPS`, `getTile`.
- `rent.ts` — `calculateRent(propertyId, property, allProperties, diceRoll)`: property ladder (hotels→index 5 else house count), ×2 undeveloped monopoly, railroad `25·2^(n-1)`, utility `dice·(ownedUtilities===2 ? 10 : 4)`, mortgaged/unowned → 0.
- `cards.ts` — 16 Chance + 16 Community Chest cards, each with a typed `CardAction`; shuffled once at module load. Drawn round-robin by a persisted `chanceIndex`/`communityChestIndex` (sequential, not re-shuffled between draws).
- `actions.ts` — `payPlayer`, `movePlayer`/`moveBy` (+$200 on passing Go), `nearestTileIndex`, `sendToJail`, `applyCard`, `resolveLanding`, `hasFullColorGroup`.
- `guards.ts` — `assertIsActivePlayer`, `assertGamePhase`.
- `route-utils.ts` — `routeError`, `badRequest`, `rollDice`. (Planned home of `authenticatePlayer`/`requireCurrentTurn`/`requirePhase`.)
- `scoring.ts` — `calculateScores` (placement points + bonuses).
- `bankruptcy.ts` — `checkBankruptcy` (creditor-aware asset transfer). **DEAD CODE — never imported.** To be wired in during Phase 6.

### API routes (`app/api/`)
Game: `roll`, `land`, `buy`, `pass-purchase`, `jail`, `build`, `mortgage`, `bankrupt`, `trade`, `auction`, `auction-resolve`, `end-turn`, `end`, `init`.
Lobby: `lobby/create`, `lobby/validate`, `lobby/update-visibility`.
Auth: `liveblocks-auth`.

### Client structure
- `app/game/[roomId]/` — `page.tsx` (server, wraps `Room`) → `Room.tsx` (RoomProvider + username gate) → `GameShell.tsx` (routes on `gamePhase`) → `GameBoard.tsx` (**607-line monolith**: lobby + game + duplicated mobile UI) or `EndGameScreen.tsx`.
- `components/game/` — Board, ActionPanel, AuctionPanel, PropertyManager, PropertyDetailModal, TradePanel, TradeOfferModal, DiceRoller (+`dice/` R3F canvas), GameLog, PlayerDashboard, PlayerToken, Tile, BankruptcyOverlay, ConnectionBanner, CardsListModal, `helpers.ts`.
- `components/lobby/LobbyWaitingScreen.tsx` — **ORPHANED** (imported by GameShell but never rendered; the lobby was reimplemented inline in GameBoard). Slated for deletion in Phase 1.
- `hooks/` — `useConnectionStatus`, `useTurnSync`.

## Game phase state machine

`GamePhase = lobby | playing | rolling | landed | buy_decision | auction | trade | ended`

Happy path: `lobby` →(`init`)→ `playing` →(`roll`)→ `landed` →(`land`)→ `playing` (or `buy_decision` on unowned property, or `auction`) →(`end-turn`)→ next player's `playing`. Win: `endTurn` sets `ended` when ≤1 non-bankrupt player remains.

Note: `roll` and `land` are **two separate client calls** today. This split is the source of several bugs (see Pitfalls). Phase 3 merges landing resolution into `roll` server-side.

## Identity & reconnection

- **Username** entered in a modal, stored in `sessionStorage`/`localStorage` under `fastopoly_username`. This is the only identity — unauthenticated and non-unique.
- **In-game player id = `player-${connectionId}`** (Liveblocks per-connection number), frozen into `players[]` at `init`. It is **ephemeral** — changes on every reconnect.
- Reconnection matching: `resolveLocalPlayer` in `components/game/helpers.ts` — tries exact `player-<connectionId>`, then falls back to matching `presence.username`. Duplicate usernames collapse to the first record.

## Trust model — READ THIS

The intended design is server-authoritative, but **it is currently bypassable end-to-end**. Do not assume any server-side guard holds until Phase 2/3 land.

- `app/api/liveblocks-auth/route.ts:22` grants `session.FULL_ACCESS` to **any** username for **any** room → clients can write Storage **directly** from the browser console, bypassing all `app/api/game/*` validation. (Phase 2: downgrade to `READ_ACCESS` = storage-read + presence-write.)
- Every `app/api/game/*` route trusts a body-supplied `playerId`. `assertIsActivePlayer` only checks the id equals the current player — not that the *caller* is that player. Impersonation is trivial.
- Only `buy` is race-safe (`transactionalMutate`). All other routes use non-atomic `mutateGameStorage` → concurrent requests can lose updates (TOCTOU).

## Known pitfalls (bug inventory — being fixed by phase)

Security/exploits (Phase 2–3): FULL_ACCESS auth hole; body-`playerId` trust; `build`/`mortgage`/`bankrupt` have no turn/phase guard (can act on other players); `trade` has no identity check (self-accept); `end-turn`/`end`/`init` take only `roomId`; `/land` replayable in `playing` phase → repeated card draws mint cash; client-supplied `diceTotal` underpays utility rent; roll-then-end-turn skips rent.

Rules correctness (Phase 6): bankruptcy always returns property to the bank (creditor-transfer logic in `bankruptcy.ts` is dead); `payPlayer` allows unlimited negative cash and fully credits receiver (money not conserved); `build` has no cash check; no 3-consecutive-doubles→jail; jail exits don't move the token; go-to-jail on doubles grants an erroneous extra roll; mortgaged-property trades skip 10% interest; even-build ignores mortgaged group members; hotel demolish can underflow `houseSupply`.

Dead/unimplemented: `speedDie` (UI toggle, no logic), `bank: 20580` (never read/mutated), `ownedColorGroups` + `bankruptciesCaused` (scoring bonuses that never fire). Dead exports: `ownedPropertyTiles` (helpers), `combineQuaternions` (dice-orientations), `RollResponse`/`PendingBuy`/`actionMessage` (ActionPanel), unused `sendToJail` import in the roll route.

Lifecycle/persistence (Phase 7): player disconnect mid-turn stalls the game forever (no turn timer/auto-skip); disconnect between roll and land sticks the room in `landed`; auction resolution depends on the lowest-connectionId client being online; leaderboard is silently broken (`game_results.user_id` is a uuid FK but code inserts `player-N` strings, and `users` is never populated); no stale-room cleanup; duplicate end-game persistence can double-count.

UI/UX (Phase 4–5, 8): empty Tailwind `theme.extend`, hardcoded hex colors duplicated across files, no `next/font`, two clashing themes (cream/green vs dark `#0a0a0a`); `GameBoard.tsx` monolith with duplicated desktop/mobile lobbies; no toast system (`Board.tsx` swallows API errors to `console.error`); z-index chaos (many overlays at `z-50`, no coordination/focus-trap/scroll-lock/Escape); zero ARIA, no keyboard nav; invalid Tailwind classes silently no-op (`text-sky-850`, `text-zinc-755`, `h-4.5`/`w-4.5`); sub-1cqw board text; dice `frameloop="always"` burns GPU.

## Verification: canonical two-tab manual test

No e2e tests exist. Until they do, verify multiplayer changes with **two browser tabs** (or two profiles — identity is per-`localStorage`):

1. Tab A: Home → PLAY → enter username → Host a game → land on `/game/<code>`.
2. Tab B: Home → PLAY → enter a **different** username → Join → enter `<code>` (or pick from Public Games).
3. Both: toggle **Ready**. Tab A (host): **Start Game**.
4. Active player: **Roll** → token moves → resolve landing (Buy / Auction / pay rent / draw card).
5. Exercise: **buy** a property; land on an owned property to pay **rent**; open **Trade** and complete an exchange; trigger an **auction** (pass on an unowned property); **mortgage**/**build**; **bankrupt**; play to a winner and confirm the **EndGameScreen** + leaderboard write.

Adversarial checks (after Phase 2): from the console, `room.getStorage()` then attempt `root.set(...)` → must be rejected; `fetch('/api/game/mortgage', { body: { playerId: <other player> } })` → 401/403; call `/api/game/init` from a non-host tab → 403.

Engine changes: `npm run test` (vitest) + `npm run typecheck`.

## Conventions

- Path alias `@/*` → repo root (tsconfig). Prefer it over deep relative imports.
- Keep route bodies writing `(storage: JsonStorage) => ...` mutators — Phase 3 swaps the executor underneath, so preserving the mutator shape keeps routes stable.
- Colors are currently hardcoded hex; new UI should use the design tokens once Phase 4 lands (`tailwind.config.ts`). Don't add new raw hex.
- `three` / R3F is heavy — keep the dice canvas dynamically imported (`ssr:false`) so it doesn't load on non-game pages.
