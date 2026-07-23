# Fastopoly 🎲

Fastopoly is a modern, real-time multiplayer Monopoly clone. It features a responsive board with interactive 3D dice, user accounts with persistent stats, and a server-authoritative game engine that keeps play fair.

Built with **Next.js**, **TypeScript**, **Liveblocks**, and **Supabase**.

---

## 🚀 Features

- **Real-Time Multiplayer** — Liveblocks Storage and Presence synchronize board state, turns, and player movement with millisecond latency.
- **Accounts & Profiles** — Play instantly as a guest, or sign in with Google or email. Every player (guests included) gets a profile with persistent stats, and a guest can upgrade to a full account later without losing history.
- **Server-Authoritative Engine** — Clients can't mutate game state. Every action is validated server-side and authorized with an HMAC seat token bound to your account, so seats can't be stolen or impersonated.
- **Interactive 3D Dice** — Fully rendered 3D dice with randomized spins and smooth settling. Rolls are resolved on the server; the animation is purely visual.
- **Full Monopoly Rules** — Rent ladders and color-group doubling, houses/hotels with even-build and bank supply limits, mortgaging with 10% transfer interest, jail (including three-doubles), auctions, trades (properties, cash, and Get Out of Jail cards), and creditor-aware bankruptcy.
- **Disconnect Resilience** — Turn timers auto-roll for absent players instead of skipping them, rooms recover from dropped clients, and rejoining restores your seat automatically from any device.
- **Leaderboard & History** — Completed games persist per-account placements and points; profiles show aggregate stats and recent games.
- **Accessible & Responsive** — Keyboard-operable controls, ARIA live regions for game events, reduced-motion support, and one responsive layout from mobile to desktop.

---

## 🔄 How a Game Works

### 1. Sign in (or don't)

The cover page takes a name and drops you straight into a game as a guest, or you can continue with Google or email. Guests are real (anonymous) accounts under the hood, so their stats are tracked just like everyone else's.

### 2. Hosting

**Host a game** calls `/api/lobby/create`, which — concurrently — inserts the room into Supabase `public_rooms`, seeds the Liveblocks storage document server-side, and issues the host token. You're redirected to `/game/<5-letter-code>`.

### 3. Joining

Players join at `/lobby/join` with a room code or from the **Public Games** list (polled from `/api/lobby/list`, which also sweeps out inactive rooms). Duplicate usernames in a room are rejected, and you can only be in one active game at a time — opening the app in a new tab redirects you back into your current game.

### 4. Lobby

Presence syncs each player's color, name, and ready state live. The host — verified by the room's recorded host plus possession of the host token, not by join order — configures the map and rules and starts the game once everyone is ready.

### 5. Playing

`/api/game/init` seats the players, randomizes who goes first, and flips the room to `playing`. From then on each turn is one atomic server call: `roll` moves the token **and** resolves the landing (rent, card, tax, jail) in a single transaction. A 25-second timer auto-rolls for anyone who goes idle; players who fall into debt get 80 seconds to mortgage, sell, or declare bankruptcy before it's declared for them.

---

## 🛠️ Technology Stack

- **Framework**: [Next.js (App Router)](https://nextjs.org/)
- **Language**: [TypeScript](https://www.typescriptlang.org/) (strict)
- **Real-time Sync**: [Liveblocks](https://liveblocks.io/)
- **Auth & Database**: [Supabase](https://supabase.com/)
- **3D**: [react-three-fiber](https://docs.pmnd.rs/react-three-fiber) / three.js
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Testing**: [Vitest](https://vitest.dev/)

---

## 📦 Getting Started

### 1. Prerequisites

Node.js v18+ and npm. You'll also need a free [Liveblocks](https://liveblocks.io/) project and a free [Supabase](https://supabase.com/) project.

### 2. Install

```bash
npm install
```

### 3. Environment

Create `.env.local` in the repo root:

```ini
# Liveblocks (real-time sync)
NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_KEY=your_liveblocks_public_key
LIVEBLOCKS_SECRET_KEY=your_liveblocks_secret_key

# Supabase (auth, rooms, leaderboard)
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Optional but recommended in production: secret for HMAC seat tokens.
# Falls back to LIVEBLOCKS_SECRET_KEY when unset.
GAME_TOKEN_SECRET=a_long_random_string
```

### 4. Database

Apply `lib/supabase/schema.sql` to your Supabase project. It creates `profiles` (1:1 with `auth.users`, auto-populated by a signup trigger), `game_results`, and `public_rooms`, along with the row-level security policies.

> **Note:** every table is RLS-enabled with public *read* policies only — all writes go through the server's service-role key. If you add a table, remember to add a read policy or the browser will silently see nothing.

### 5. Auth providers (Supabase dashboard)

Email/password works out of the box. For the other sign-in methods:

| Provider | Setup |
| :-- | :-- |
| **Guest play** | Authentication → Sign In/Providers → enable **Anonymous sign-ins**. Required, or "Play as guest" fails. |
| **Google** | Authentication → Providers → Google → enable, then paste an OAuth client ID/secret from [Google Cloud Console](https://console.cloud.google.com) (free, no billing). Set the authorized redirect URI to `https://<your-project-ref>.supabase.co/auth/v1/callback`. |
| **Guest upgrades** | Optional — enable **Manual linking** so a guest who later signs in with Google keeps their stats instead of creating a second account. |

### 6. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## 🧪 Scripts

```bash
npm run dev        # development server
npm run build      # production build
npm run start      # serve the production build
npm run typecheck  # tsc --noEmit (strict)
npm run lint       # next lint
npm run test       # vitest — 103 engine tests across 10 suites
```

The test suite covers the pure game engine: board, rent, cards, actions, turn resolution, scoring, bankruptcy, seat auth, server state, and room cleanup. Multiplayer flows are verified manually with two browser profiles (see `CLAUDE.md`).

---

## 📂 Project Structure

```text
├── app/
│   ├── api/
│   │   ├── game/         # Authoritative game mutations (roll, buy, trade, …)
│   │   └── lobby/        # Room create/validate/list/heartbeat
│   ├── auth/callback/    # Supabase OAuth code exchange
│   ├── game/[roomId]/    # Room provider, game shell, board screen
│   ├── lobby/            # Host and join screens
│   ├── profile/          # Account stats and recent games
│   ├── leaderboard/
│   └── page.tsx          # Cover page with inline sign-in
├── components/
│   ├── auth/             # AuthProvider (session + profile)
│   ├── game/             # Board, dice, panels, overlays
│   ├── lobby/            # Lobby settings and player list
│   └── ui/               # Button, Modal, Toast primitives
├── hooks/                # useGameActions, useCountdown, presence/connection hooks
├── lib/
│   ├── game-engine/      # Board, rules, turn engine, auth, persistence, cleanup
│   ├── supabase/         # Browser/server clients + schema.sql
│   └── liveblocks.config.ts
├── tests/                # Vitest engine suites
├── middleware.ts         # Refreshes the Supabase session cookie
└── public/               # Static assets
```

---

## 📄 License

Open-source under the [MIT License](LICENSE).
