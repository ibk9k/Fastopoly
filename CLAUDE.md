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
- **Action authorization** (Phase 2A) is separate from this UI-level resolution: it's the HMAC token keyed by `<roomId>-<playerId>` in `localStorage` (see Trust model). The token survives reconnects, so a returning player keeps control of their seat as long as `localStorage` persists.

## Trust model — READ THIS

Server authority is enforced end-to-end (Phase 2A + 2B landed). Clients can neither impersonate via the API nor write Storage directly.

- **Auth model (`lib/game-engine/auth.ts`):** every `app/api/game/*` route requires an `x-player-token` header. A token is `HMAC-SHA256(secret, "<roomId>:<subject>")` where subject is a playerId (player action) or the literal `"host"` (host action). `authenticatePlayer(storage, roomId, playerId, token)` verifies the caller holds the token for the playerId they claim and returns that seated player — routes derive identity from it, never from the raw body field. `authenticateHost` gates `init`/`end`/`lobby-settings`. The secret falls back to `LIVEBLOCKS_SECRET_KEY` (so it works today); set `GAME_TOKEN_SECRET` in production.
- **Token issuance:** players claim-once via `POST /api/game/claim-token` (gated on seat + username, sets `player.tokenClaimed`); the token is returned to the client and stored in `localStorage` (`lib/game-client/tokens.ts`), never written to Storage. The host token is issued by `POST /api/lobby/create`. Client-side, `postJson` (in `components/game/helpers.ts`) auto-attaches the right token based on the request body (lazy-claiming the player token if missing).
- **Liveblocks access = `READ_ACCESS`** (`app/api/liveblocks-auth/route.ts`): the issued token grants `["room:read", "room:presence:write"]` only — clients read Storage and write their own presence, but **direct Storage writes are rejected by the Liveblocks server**. All mutations must go through the token-guarded routes. Consequences that are load-bearing: (1) storage is **server-seeded** at room creation via `seedLobbyStorage` in `server-state.ts` (`createRoom` + `initializeStorageDocument`), since the client can't bootstrap it; (2) lobby settings changes go through `POST /api/game/lobby-settings` (host-only), not client `useMutation`; (3) ready/turn/username are **presence** (still client-writable), not Storage.
- **Residual risk:** the claim is gated on the username, which is public in Storage — an attacker who claims a seat before its legit player could take it (accounts are out of scope; Phase 7 adds host seat-recovery). Documented in `claim-token/route.ts`.
- Only `buy` is race-safe (`transactionalMutate`). All other routes use non-atomic `mutateGameStorage` → concurrent requests can lose updates (TOCTOU). **This is now the top remaining security/correctness gap — Phase 3.**

## Known pitfalls (bug inventory — being fixed by phase)

Security/exploits — **fixed in Phase 2A** (via HMAC tokens + route guards): body-`playerId` impersonation; `build`/`mortgage`/`bankrupt` acting on other players / off-turn (now token + turn + phase guarded, build has a cash check); `trade` self-accept (now proposer/recipient identity enforced + re-validated on accept); `end-turn`/`end`/`init` unauthenticated (now current-player / host-token gated); `/land` replay (now `landed`-phase only); client `diceTotal` utility-rent underpay (now read from `storage.lastDiceRoll`); roll-then-end-turn skip-rent (`end-turn` now requires `playing` phase, so landing must resolve first); game reset via `init` (now host-only + no-clobber guard). **Still open — Phase 2B:** `FULL_ACCESS` direct-storage-write hole. **Phase 3:** TOCTOU races on non-`buy` routes.

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
