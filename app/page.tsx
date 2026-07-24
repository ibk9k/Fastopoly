'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'
import { customAlphabet } from 'nanoid'
import { setStoredHostToken } from '@/lib/game-client/tokens'
import { useAuth } from '@/components/auth/AuthProvider'
import Button from '@/components/ui/Button'
import PropertyStrip from '@/components/ui/PropertyStrip'
import GoogleIcon from '@/components/auth/GoogleIcon'

const createCode = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 5)

const inputClass =
  'w-full rounded-lg border-2 border-pine/20 bg-parchment/40 px-4 py-3 font-bold text-pine placeholder-zinc-400 outline-none transition-all focus:border-pine'

function HomePageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, profile, ready, signInAsGuest, signInWithGoogle, signInWithEmail, signUpWithEmail, signOut } = useAuth()

  const [name, setName] = useState('')
  const [emailMode, setEmailMode] = useState<'hidden' | 'signin' | 'signup'>('hidden')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [showPlayModal, setShowPlayModal] = useState(false)
  const [creating, setCreating] = useState(false)
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null)

  // Surface OAuth errors handed back by /auth/callback.
  useEffect(() => {
    const authError = searchParams.get('authError')
    if (authError) setError(authError)
  }, [searchParams])

  const signedIn = Boolean(user)

  // Auto-detect if user is already in an active game and redirect directly into it.
  // Keyed on the session server-side, so it only runs once signed in.
  useEffect(() => {
    if (!ready || !signedIn) return
    let isMounted = true
    fetch('/api/lobby/active-user-room')
      .then((res) => res.json())
      .then((data: { activeRoomId?: string | null }) => {
        if (!isMounted) return
        if (data.activeRoomId) {
          setActiveRoomId(data.activeRoomId)
          router.replace(`/game/${data.activeRoomId}`)
        }
      })
      .catch(() => undefined)
    return () => {
      isMounted = false
    }
  }, [ready, signedIn, router])

  async function handleGuest() {
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Enter a name to play')
      return
    }
    setBusy(true)
    setError(null)
    const { error: signInError } = await signInAsGuest(trimmed)
    setBusy(false)
    if (signInError) {
      setError(signInError)
      return
    }
    setShowPlayModal(true)
  }

  async function handleGoogle() {
    setBusy(true)
    setError(null)
    const { error: oauthError } = await signInWithGoogle()
    setBusy(false)
    if (oauthError) setError(oauthError)
    // On success the browser is redirected to Google.
  }

  async function handleEmailSubmit() {
    if (!email.trim() || !password) {
      setError('Email and password are required')
      return
    }
    setBusy(true)
    setError(null)
    setNotice(null)

    const result =
      emailMode === 'signup'
        ? await signUpWithEmail(email.trim(), password, name.trim() || email.trim().split('@')[0])
        : await signInWithEmail(email.trim(), password)

    setBusy(false)
    if (result.error) {
      setError(result.error)
      return
    }
    if ('needsConfirmation' in result && result.needsConfirmation) {
      setNotice('Check your email to confirm your account, then sign in.')
      return
    }
    setEmailMode('hidden')
    setPassword('')
  }

  async function createRoomAndRedirect() {
    if (activeRoomId) {
      router.push(`/game/${activeRoomId}`)
      return
    }

    const playerName = profile?.username ?? name.trim()
    if (!playerName) {
      setError('Enter a name first')
      return
    }

    const roomCode = createCode()
    const rules = { startingCash: 1500, freeParkingJackpot: false, auctionOnPass: true, speedDie: false, maxPlayers: 4 }

    setCreating(true)
    setError(null)
    const response = await fetch('/api/lobby/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomCode, username: playerName, mapType: 'classic', rules, isPublic: true }),
    })
    const result = (await response.json()) as { roomCode?: string; hostToken?: string; error?: string }
    setCreating(false)

    if (!response.ok || !result.roomCode) {
      setError(result.error ?? 'Could not create room')
      return
    }
    if (result.hostToken) setStoredHostToken(result.roomCode, result.hostToken)

    sessionStorage.setItem('fastopoly_rules', JSON.stringify(rules))
    sessionStorage.setItem('fastopoly_mapType', 'classic')
    router.push(`/game/${result.roomCode}`)
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-parchment px-6 font-sans text-zinc-900">
      <PropertyStrip position="top" />

      <section className="z-0 flex w-full max-w-md flex-col items-center py-16 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/Logo.png"
          alt="Fastopoly"
          width={951}
          height={393}
          className="h-auto w-80 max-w-full sm:w-96 lg:w-[26rem]"
        />
        <p className="mt-4 text-lg font-bold text-pine/75">Play with friends, anywhere</p>

        {error ? (
          <p role="alert" className="mt-4 w-full rounded-md border border-danger-line bg-danger-surface px-3 py-2 text-sm font-bold text-danger">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p className="mt-4 w-full rounded-md border border-success/30 bg-success-surface px-3 py-2 text-sm font-bold text-success">{notice}</p>
        ) : null}

        {!ready ? (
          <div className="mt-10 h-40 w-full animate-pulse rounded-2xl border-2 border-salmon-line/30 bg-parchment-raised" />
        ) : signedIn ? (
          /* ── Signed in: straight to play ─────────────────────────────── */
          <div className="mt-8 w-full rounded-2xl border-2 border-salmon-line/50 bg-parchment-raised p-6 shadow-card">
            {activeRoomId ? (
              <div className="mb-4 rounded-xl border border-pine/30 bg-felt/40 p-3.5 text-center shadow-sm">
                <p className="text-xs font-black uppercase tracking-wider text-pine">Game in progress</p>
                <p className="mt-0.5 text-sm font-extrabold text-zinc-800">Room: {activeRoomId}</p>
                <Button size="sm" className="mt-2.5 w-full" onClick={() => router.push(`/game/${activeRoomId}`)}>
                  Rejoin Active Game
                </Button>
              </div>
            ) : null}

            <div className="flex items-center justify-center gap-3">
              {profile?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.avatar_url} alt="" className="h-10 w-10 rounded-full border-2 border-pine/20 object-cover" />
              ) : (
                <span className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-pine/20 bg-felt font-display text-lg text-pine">
                  {(profile?.username ?? '?').slice(0, 1).toUpperCase()}
                </span>
              )}
              <div className="text-left">
                <p className="font-extrabold leading-tight text-pine">{profile?.username ?? 'Player'}</p>
                <p className="text-xs font-bold text-ink-muted">
                  {profile?.is_guest ? 'Playing as guest' : 'Signed in'}
                  {profile ? ` · ${profile.games_played} games · ${profile.wins} wins` : ''}
                </p>
              </div>
            </div>

            <Button size="lg" className="mt-5 w-full" onClick={() => setShowPlayModal(true)}>
              Play
            </Button>

            <div className="mt-3 flex items-center justify-center gap-4 text-xs font-bold uppercase tracking-wide">
              <Link href="/profile" className="text-pine/70 transition-colors hover:text-pine">
                Profile
              </Link>
              <Link href="/leaderboard" className="text-pine/70 transition-colors hover:text-pine">
                Leaderboard
              </Link>
              <button onClick={() => void signOut()} className="text-pine/70 transition-colors hover:text-pine">
                Sign out
              </button>
            </div>

            {profile?.is_guest ? (
              <p className="mt-4 border-t border-salmon-line/30 pt-3 text-[11px] font-semibold text-ink-muted">
                Guest stats are saved. Sign in with Google or email later to keep them permanently.
              </p>
            ) : null}
          </div>
        ) : (
          /* ── Signed out: name, Google, or email ──────────────────────── */
          <div className="mt-8 w-full rounded-2xl border-2 border-salmon-line/50 bg-parchment-raised p-6 shadow-card">
            <label htmlFor="player-name" className="block text-left text-xs font-extrabold uppercase tracking-widest text-pine/70">
              Your name
            </label>
            <input
              id="player-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && emailMode === 'hidden') void handleGuest()
              }}
              className={`mt-2 ${inputClass}`}
              placeholder="e.g. Alex"
              maxLength={15}
              autoComplete="nickname"
            />
            <Button size="lg" className="mt-3 w-full" loading={busy} onClick={() => void handleGuest()}>
              Play as guest
            </Button>

            <div className="my-5 flex items-center gap-3">
              <span className="h-px flex-1 bg-salmon-line/40" />
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-ink-muted">or keep your stats</span>
              <span className="h-px flex-1 bg-salmon-line/40" />
            </div>

            <Button variant="secondary" className="w-full" disabled={busy} onClick={() => void handleGoogle()}>
              <GoogleIcon />
              Continue with Google
            </Button>

            {emailMode === 'hidden' ? (
              <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={() => setEmailMode('signin')}>
                Continue with email
              </Button>
            ) : (
              <div className="mt-3 grid gap-2 border-t border-salmon-line/30 pt-3">
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className={inputClass}
                  placeholder="you@example.com"
                  autoComplete="email"
                />
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void handleEmailSubmit()
                  }}
                  className={inputClass}
                  placeholder="Password"
                  autoComplete={emailMode === 'signup' ? 'new-password' : 'current-password'}
                />
                <Button className="w-full" loading={busy} onClick={() => void handleEmailSubmit()}>
                  {emailMode === 'signup' ? 'Create account' : 'Sign in'}
                </Button>
                <button
                  onClick={() => setEmailMode(emailMode === 'signup' ? 'signin' : 'signup')}
                  className="text-xs font-bold text-pine/70 underline-offset-2 transition-colors hover:text-pine hover:underline"
                >
                  {emailMode === 'signup' ? 'Already have an account? Sign in' : 'New here? Create an account'}
                </button>
              </div>
            )}

            <Link
              href="/leaderboard"
              className="mt-5 block text-xs font-extrabold uppercase tracking-wide text-pine/60 transition-colors hover:text-pine"
            >
              Leaderboard
            </Link>
          </div>
        )}
      </section>

      <PropertyStrip position="bottom" />

      {showPlayModal ? (
        <div className="fixed inset-0 z-modal flex items-center justify-center bg-black/50 px-6" onClick={() => setShowPlayModal(false)}>
          <div
            className="w-full max-w-sm rounded-xl border-[3px] border-pine bg-parchment-raised p-6 shadow-overlay"
            onClick={(event) => event.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/Logo.png" alt="Fastopoly" width={951} height={393} className="mx-auto h-auto w-44" />
            <div className="mt-5 grid gap-3">
              <Button size="lg" loading={creating} onClick={() => void createRoomAndRedirect()}>
                {creating ? 'Creating…' : 'Host a game'}
              </Button>
              <Button variant="secondary" onClick={() => router.push('/lobby/join')}>
                Join a game
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}

export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <HomePageInner />
    </Suspense>
  )
}
