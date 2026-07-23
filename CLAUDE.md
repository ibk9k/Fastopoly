# CLAUDE.md — Fastopoly

Reference for working in this repo. Read **Trust model** and **Known pitfalls** before touching game logic or auth — several invariants are load-bearing and easy to reintroduce.

## What this is

**Fastopoly** — a real-time multiplayer Monopoly clone. Next.js 14 (App Router) + TypeScript (strict) + Tailwind, with **Liveblocks** for real-time state and **Supabase** for auth, the room directory, and the leaderboard. 3D dice via react-three-fiber.

The staged overhaul (Phases 0–8) is complete, followed by a **user-accounts** milestone and a **room-lifecycle** milestone. Direction: **security-first**, keep the **cream/green** visual identity, target **public deployment**.

**Design-system conventions:** use the `components/ui` primitives (`Button`, `Modal`, `Toast`, `PropertyStrip`), the semantic Tailwind tokens (`pine`/`parchment`/`salmon`/`felt`/`danger`/`success`/`seat-*`), and the z-index scale (`z-board < z-panel < z-modal < z-toast < z-critical`). No new raw hex, no ad-hoc `z-50`.

## Commands

```bash
npm run dev        # next dev — http://localhost:3000
npm run build      # next build
npm run start      # next start (prod)
npm run typecheck  # tsc --noEmit  (strict)
npm run lint       # next lint
npm run test       # vitest run — 105 engine tests across 10 suites
```

Node 18+. Needs `.env.local` (below); the app throws without `LIVEBLOCKS_SECRET_KEY`, and auth/lobby/leaderboard fail without the Supabase keys.

## Environment variables

```ini
NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_KEY=   # client
LIVEBLOCKS_SECRET_KEY=               # server (Liveblocks Node SDK + auth route)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=       # browser reads (public_rooms, profiles, game_results)
SUPABASE_SERVICE_ROLE_KEY=           # server writes (bypasses RLS)
GAME_TOKEN_SECRET=                   # HMAC seat-token secret. REQUIRED in production
                                     # (throws without it); falls back to
                                     # LIVEBLOCKS_SECRET_KEY in dev only.
CRON_SECRET=                         # bearer secret for /api/cron/cleanup
```

`.env.local` is gitignored. Only `.env.example` is tracked.

### Supabase dashboard setup (not in code)

Two toggles must be flipped by hand or the matching sign-in path fails at runtime:

1. **Authentication → Sign In/Providers → Anonymous sign-ins: enable.** Guest play returns *"Anonymous sign-ins are disabled"* without it.
2. **Authentication → Providers → Google: enable** + client ID/secret from Google Cloud, with `https://<project-ref>.supabase.co/auth/v1/callback` as the authorized redirect URI (**not** localhost — Supabase forwards to the app's `/auth/callback`).
3. Optional — **Manual linking**: lets a guest upgrade to Google while keeping their stats. Without it, the code falls back to a plain sign-in that creates a separate account.

Email/password needs no setup.

## Architecture

### State ownership
- **Liveblocks Storage** — authoritative game state, one document per room, id `fastopoly-${roomCode}` (`liveblocksRoomId()` in `server-state.ts`). Schema: `Storage` / `JsonStorage` in `lib/liveblocks.config.ts`.
- **Liveblocks Presence** — transient per-connection UI state: `{ username, currentTile, isMyTurn, isReady }`.
- **Supabase** — durable data only: `profiles` (accounts + aggregate stats), `game_results` (per-game history), `public_rooms` (lobby directory). Schema + RLS: `lib/supabase/schema.sql`.

### Request flow
Clients **cannot** mutate game state directly. They POST to route handlers under `app/api/game/*`, which read → mutate → write the Storage document server-side via the Liveblocks Node SDK. Liveblocks fans the delta to all clients over WebSocket; components re-render from `useStorage`. Some routes also `broadcastRoomEvent` transient `RoomEvent`s (dice, card, bankrupt, trade) consumed via `useEventListener`.

```
Browser ──POST /api/game/*──▶ route handler ──Liveblocks Node SDK──▶ Storage doc
                                                                          │
Browser ◀────────────── WebSocket storage delta ◀─────────────────────────┘
```

### Server-state helpers (`lib/game-engine/server-state.ts`)
- **`mutateGameStorage(roomId, mutator)`** — the single executor for every route. Runs read → `(storage: JsonStorage) => T` mutator → JSON-diff → write **inside one `mutateStorage` transaction**, so concurrent requests serialize. A mutator may return `{ skipWrite: true }` to suppress the write.
- `readGameStorage` / `writeGameStorage` — REST read / keyed write.
- `seedLobbyStorage(roomId, rules, mapType)` — `createRoom` + `initializeStorageDocument` (LSON) at room creation. Required because READ_ACCESS clients can't bootstrap storage.
- `endTurn` / `handlePostLanding` — turn progression (doubles, debt-limbo, win check).
- `refreshTurnDeadline` — **debt-aware**: `TURN_TIMEOUT_MS` (25 s) normally, `DEBT_TIMEOUT_MS` (80 s) when the active player is in debt.
- `addLog`, `playerMap`, `propertyMap`, `toPropertyRecord`.

### Game engine (`lib/game-engine/`) — pure functions over `JsonStorage`
- `board.ts` — `BOARD` (40 tiles), `PROPERTY_IDS`, `COLOR_GROUPS`, `getTile`.
- `rent.ts` — property ladder, ×2 undeveloped monopoly, railroad `25·2^(n-1)`, utility `dice·(4|10)`, mortgaged/unowned → 0.
- `cards.ts` — 16 Chance + 16 Community Chest, typed `CardAction`, drawn round-robin via persisted indices.
- `actions.ts` — `payPlayer`, `movePlayer`/`moveBy`, `nearestTileIndex`, `sendToJail`, `applyCard`, `resolveLanding`.
- `turn.ts` — **`applyRoll`** (movement + landing in one call), `resolveCurrentTile`, `enforceTurnTimeout` (auto-roll), `resolveExpiredAuction`, `inferCreditorId`.
- `bankruptcy.ts` — `executeBankruptcy`: creditor-aware asset transfer (wired in, not dead).
- `auth.ts` — HMAC seat tokens: `signGameToken`, `verifyToken`, `authenticatePlayer`, `authenticateHost`.
- `persistence.ts` — `persistGameResults`: credits stats **by auth uid**.
- `room-cleanup.ts` — `cleanupInactiveRooms`, `touchRoomActivity`, `findActiveUserRoom`.
- `guards.ts`, `route-utils.ts`, `scoring.ts`, `board-layout.ts`.

### API routes (`app/api/`)
**Game:** `roll`, `buy`, `pass-purchase`, `jail`, `build`, `mortgage`, `bankrupt`, `trade`, `auction`, `auction-resolve`, `end-turn`, `end`, `init`, `claim-token`, `lobby-settings`, `enforce-turn`, `release-seat`.
**Lobby:** `create`, `validate`, `update-visibility`, `list`, `heartbeat`, `active-user-room`.
**Auth:** `liveblocks-auth` (Liveblocks session), `app/auth/callback` (Supabase OAuth code exchange).

> There is **no `/api/game/land`** — Phase 3 merged landing into `roll`. Don't reintroduce it.

### Client structure
- `app/page.tsx` — cover page: inline guest/Google/email sign-in, active-game auto-redirect.
- `app/game/[roomId]/` — `page.tsx` → `Room.tsx` (RoomProvider + auth gate + one-shot room validation) → `GameShell.tsx` (routes on `gamePhase`) → `GameBoard.tsx` or `EndGameScreen.tsx`.
- `app/profile/`, `app/leaderboard/`, `app/lobby/{host,join}/`.
- `components/auth/` — `AuthProvider` (session + profile + sign-in actions), `GoogleIcon`.
- `components/ui/` — `Button`, `Modal` (focus trap/Escape/scroll lock), `Toast`, `PropertyStrip`.
- `components/game/` — Board, ActionPanel, AuctionPanel, PropertyManager, PropertyDetailModal, TradePanel, TradeOfferModal, DiceRoller (+`dice/` R3F canvas), GameLog, PlayerDashboard, PlayerToken, Tile, BankruptcyOverlay, DebtOverlay, TurnTimer, FlyingCard, ConnectionBanner, CardsListModal, `helpers.ts`.
- `components/lobby/` — `LobbySettings`, `PlayerList` (one responsive implementation each).
- `hooks/` — `useGameActions` (all game actions + toast-on-error), `useCountdown`, `useConnectionStatus`, `useTurnSync`.
- `middleware.ts` — refreshes the Supabase session cookie on every navigation.

## Game phase state machine

`GamePhase = lobby | playing | rolling | landed | buy_decision | auction | trade | ended`
(`rolling` is vestigial — nothing sets it.)

Happy path: `lobby` →(`init`)→ `playing` →(`roll`: moves **and** resolves the landing)→ `playing`, or `buy_decision` on an unowned property, or `auction` →(`end-turn`)→ next player. Win: `endTurn` sets `ended` when ≤1 non-bankrupt player remains.

Turn rules: three consecutive doubles jail the roller; going to jail always forfeits the turn (doubles never re-arm for a jailed player); `end-turn` requires `playing` + `hasRolled`.

## Identity & auth

Two distinct layers — don't conflate them:

1. **Account identity = Supabase auth uid.** Everyone has one, including "just type a name" players (anonymous sign-ins). `profiles` is 1:1 with `auth.users`, created by an on-signup trigger that pulls name/avatar from the OAuth provider, falling back to guest metadata → email local-part → `'Player'`. Display names are **deliberately not unique** (a unique constraint would fail OAuth signups on collision). Sessions are cookie-based via `@supabase/ssr`, so server routes can read them.
2. **In-game seat = `player-${connectionId}`**, frozen into `players[]` at `init`. Ephemeral (changes each reconnect). `resolveLocalPlayer` (`components/game/helpers.ts`) maps a connection to a seat by connectionId, then by presence username.

**Seats are bound to the auth uid** (`player.authUserId`) at claim time. The same signed-in user always reclaims their own seat — across devices, or after clearing `localStorage`. Host identity is validated against `public_rooms.host_username` **plus** possession of the host token, not lobby position.

## Trust model — READ THIS

Server authority is enforced end-to-end. Clients can neither impersonate via the API nor write Storage directly.

- **Seat tokens (`lib/game-engine/auth.ts`):** every `app/api/game/*` route requires an `x-player-token` header. A token is `HMAC-SHA256(secret, "<roomId>:<subject>")`, subject = playerId or the literal `"host"`. `authenticatePlayer(...)` verifies the caller holds the token for the playerId they claim and returns that seated player — routes derive identity from it, **never** from a body field. `authenticateHost` gates `init`/`end`/`lobby-settings`/`release-seat`.
- **Token issuance:** `POST /api/game/claim-token` binds the seat to the caller's **authenticated Supabase uid read from the session cookie** — not the username. Re-claiming your own seat is idempotent (that's how recovery works); another account gets 403 even if it spoofs your username. The token is returned to the client and stored in `localStorage` (`lib/game-client/tokens.ts`), never written to Storage. The host token comes from `POST /api/lobby/create`. `postJson` (in `helpers.ts`) auto-attaches the right token and lazily claims when missing.
- **Liveblocks access = `READ_ACCESS`** (`app/api/liveblocks-auth/route.ts`): the issued token grants `["room:read", "room:presence:write"]` only — **direct Storage writes are rejected by the Liveblocks server**. Load-bearing consequences: (1) storage is server-seeded at creation (`seedLobbyStorage`); (2) lobby settings go through `POST /api/game/lobby-settings` (host-only), not client `useMutation`; (3) ready/turn/username are **presence**, which stays client-writable.
- **Supabase RLS:** every table is RLS-enabled with **public SELECT policies only**. All writes use the service-role key server-side. If you add a table, add a read policy or the browser silently sees nothing (this exact mistake once left the lobby list and leaderboard permanently empty).
- **All mutations are atomic:** `mutateGameStorage` wraps read-mutate-write in one Liveblocks transaction; concurrent requests serialize.

## Room lifecycle

- **Heartbeat:** `GameBoard` pings `POST /api/lobby/heartbeat` every 40 s → `touchRoomActivity` bumps `public_rooms.last_active_at`.
- **Cleanup:** `cleanupInactiveRooms()` deletes rooms idle > 5 min from Supabase **and** deletes their Liveblocks documents (`server.deleteRoom`). Swept opportunistically by `GET /api/lobby/list` (throttled to one sweep per 30 s) — there is no cron.
- **Public list:** `/lobby/join` polls `/api/lobby/list` every 12 s.
- **Turn timers:** 25 s to act; on expiry `enforce-turn` **auto-rolls** for the absent player (resolving the landing and passing any buy) rather than skipping. Rolling and property management refresh the deadline. A player in debt gets **80 s** before auto-bankruptcy, surfaced by the center-screen `DebtOverlay`.
- **Auto-roll is single-writer:** `TurnTimer` elects one client per room (active player if present, else lowest `connectionId`) and enforces a given deadline once with a 3.5 s cooldown; `enforce-turn` additionally check-and-sets `storage.enforcementLockUntil` (2.5 s) **inside the mutation transaction**, so the lock holds across serverless instances. Both guards exist because every client firing at once produced *two different rolls* in the log.
- **One active game per user:** `findActiveUserRoom` blocks creating/joining a second room and auto-redirects new tabs into the existing game. It matches on the **auth uid** — `public_rooms.host_user_id` for the host, `player.authUserId` for seated players.

## Deployment

- **Host:** Vercel. Every `app/api/*` route must stay on the **Node** runtime (`node:crypto` HMAC + Liveblocks Node SDK) — never add `runtime = 'edge'`.
- **`GAME_TOKEN_SECRET` is required in production.** `tokenSecret()` throws rather than falling back to `LIVEBLOCKS_SECRET_KEY`, because that coupling would let a Liveblocks key rotation invalidate every live seat token at once.
- **GET route handlers with no request input get statically prerendered** and will serve frozen data forever. `/api/lobby/list` and `/api/lobby/active-user-room` both declare `export const dynamic = 'force-dynamic'`. Check the build output for `○ (Static)` on anything under `/api`.
- **Room cleanup** runs two ways: opportunistically from `/api/lobby/list` (throttled 30 s, module-level so it's per-instance) and on a schedule via `/api/cron/cleanup`, gated by `CRON_SECRET` and declared in `vercel.json`. The cron is daily because Hobby-tier frequency is limited; the opportunistic sweep is what actually enforces the 5-minute threshold.

## Known pitfalls

**Current, still open:**
- Guest→Google upgrade silently creates a *separate* account unless Manual linking is enabled in Supabase.
- `GamePhase` still declares `rolling`, which nothing sets.
- Dead flags: `speedDie` (rule stored, no logic — UI toggle removed).
- No e2e tests; multiplayer paths are verified by the two-tab script below.

**Fixed — do not reintroduce:**
- Body-`playerId` impersonation; off-turn `build`/`mortgage`/`bankrupt`; `trade` self-accept; unauthenticated `end-turn`/`end`/`init`; `/land` replay money-printing; client-supplied `diceTotal` rent underpay; roll-then-end-turn skip-rent; `init` game reset.
- Username-gated seat claiming (seats now bind to auth uid).
- `FULL_ACCESS` Liveblocks tokens; TOCTOU races on non-`buy` routes.
- Leaderboard writing `player-N` strings into a uuid FK; RLS enabled with zero policies.
- Bankruptcy always returning property to the bank; jail exits not moving the token; missing 3-doubles→jail; build with no cash check.
- Dice `<button>`/`<div>` swap remounting the WebGL canvas (leaked a GL context per turn); stuck `isRolling` after a backgrounded tab.
- Token teleporting past Chance/Go-To-Jail (staging now rides in the same storage delta via `lastDiceRoll.landedOn`).
- Host assignment by lobby index (`index === 0`), which let a newcomer in an emptied room appear as host and fail `init`.
- `TurnTimer` re-firing `enforce-turn` 10–50×/s and freezing at 0:00.
- Alt-Tab remounting `RoomProvider` and flashing the loading spinner (`hasValidatedRef` validates once per session).
- Username-keyed `findActiveUserRoom` (two players named "Alex" locked each other out); `/api/lobby/active-user-room?username=` letting anyone probe whether a name was in a game — identity now comes from the session cookie.
- `/api/lobby/list` statically prerendered at build time, freezing the public games list in production.
- The duplicate-username check in `/api/lobby/validate` was dead code: it recomputed the same predicate it was guarded by, so it never fired.

## Verification

**Engine changes:** `npm run test` (vitest, 105 tests / 10 suites) + `npm run typecheck`.

**Multiplayer changes — canonical two-tab test** (two browser profiles; identity is per-cookie):

1. Tab A: Home → enter a name → **Play as guest** (or sign in) → **Host a game**.
2. Tab B: different profile, different name → **Join** → enter the code or pick from Public Games.
3. Both **Ready**; Tab A (host): **Start Game**.
4. Roll → token moves → resolve landing (Buy / Auction / rent / card).
5. Exercise: buy, pay rent, trade, auction (pass on an unowned property), mortgage/build, bankrupt, play to a winner → confirm `EndGameScreen` and that stats land on the right **profile**.

**Adversarial checks:**
- Console: `room.getStorage()` then `root.set(...)` → rejected by Liveblocks.
- `fetch('/api/game/mortgage', { body: { playerId: <other player> } })` → 403.
- `/api/game/init` from a non-host tab → 403.
- Sign in as user B and `POST /api/game/claim-token` for user A's seat — **including spoofing A's username** → 403 "This seat belongs to another player".

## Conventions

- Path alias `@/*` → repo root. Prefer it over deep relative imports.
- Route bodies write `(storage: JsonStorage) => ...` mutators — keep that shape so the executor stays swappable.
- Use design tokens (`tailwind.config.ts`); no new raw hex.
- Never trust a user id from a request body — read it from the session (`getRequestUser`) or a verified token.
- `three` / R3F is heavy — keep the dice canvas dynamically imported (`ssr:false`) so it stays off non-game routes.
- The dice wrapper must remain a **single stable element type**; swapping tags remounts the WebGL canvas and leaks GL contexts.
