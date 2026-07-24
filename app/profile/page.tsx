'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/components/auth/AuthProvider'
import Button from '@/components/ui/Button'
import PropertyStrip from '@/components/ui/PropertyStrip'
import { supabase } from '@/lib/supabase/client'

type GameRow = {
  id: string
  game_id: string
  placement: number
  points_earned: number
  bonuses: string[] | null
  created_at: string
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border-2 border-salmon-line/40 bg-parchment-raised px-4 py-3 text-center">
      <p className="font-display text-2xl text-pine">{value}</p>
      <p className="mt-0.5 text-[10px] font-extrabold uppercase tracking-widest text-ink-muted">{label}</p>
    </div>
  )
}

export default function ProfilePage() {
  const router = useRouter()
  const { user, profile, ready, updateUsername, signOut } = useAuth()
  const [games, setGames] = useState<GameRow[]>([])
  const [loadingGames, setLoadingGames] = useState(true)
  const [nameDraft, setNameDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (ready && !user) router.replace('/')
  }, [ready, user, router])

  useEffect(() => {
    if (profile?.username) setNameDraft(profile.username)
  }, [profile?.username])

  useEffect(() => {
    if (!user) return
    let active = true
    void (async () => {
      const { data } = await supabase
        .from('game_results')
        .select('id,game_id,placement,points_earned,bonuses,created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10)
      if (!active) return
      setGames((data as GameRow[]) ?? [])
      setLoadingGames(false)
    })()
    return () => {
      active = false
    }
  }, [user])

  const handleSaveName = useCallback(async () => {
    const trimmed = nameDraft.trim()
    if (!trimmed || trimmed === profile?.username) return
    setSaving(true)
    setMessage(null)
    const { error } = await updateUsername(trimmed)
    setSaving(false)
    setMessage(error ?? 'Name updated.')
  }, [nameDraft, profile?.username, updateUsername])

  if (!ready || !profile) {
    return (
      <main className="relative flex min-h-screen items-center justify-center bg-parchment text-pine">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-pine/25 border-t-pine" role="status" aria-label="Loading profile" />
      </main>
    )
  }

  const winRate = profile.games_played > 0 ? Math.round((profile.wins / profile.games_played) * 100) : 0

  return (
    <main className="relative min-h-screen bg-parchment px-6 py-16 text-pine">
      <PropertyStrip position="top" />
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center justify-between gap-4">
          <h1 className="font-display text-4xl uppercase tracking-wide">Profile</h1>
          <Link
            href="/"
            className="rounded-md border-2 border-salmon-line/50 bg-parchment-raised px-4 py-2 text-sm font-extrabold uppercase tracking-wide transition-colors hover:border-pine/50"
          >
            Back
          </Link>
        </div>

        <section className="mt-8 rounded-2xl border-2 border-salmon-line/50 bg-salmon p-6 text-zinc-900 shadow-card">
          <div className="flex items-center gap-4">
            {profile.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatar_url} alt="" className="h-16 w-16 rounded-full border-2 border-pine/20 object-cover" />
            ) : (
              <span className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-pine/20 bg-felt font-display text-2xl text-pine">
                {profile.username.slice(0, 1).toUpperCase()}
              </span>
            )}
            <div>
              <p className="font-display text-2xl text-zinc-900">{profile.username}</p>
              <p className="text-xs font-bold uppercase tracking-wide text-zinc-700">
                {profile.is_guest ? 'Guest account' : user?.email ?? 'Signed in'}
              </p>
            </div>
          </div>

          {profile.is_guest ? (
            <p className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900">
              You&apos;re playing as a guest. Sign in with Google or email from the home page to keep these stats permanently.
            </p>
          ) : null}

          <div className="mt-5">
            <label htmlFor="display-name" className="block text-xs font-extrabold uppercase tracking-widest text-zinc-700">
              Display name
            </label>
            <div className="mt-2 flex gap-2">
              <input
                id="display-name"
                value={nameDraft}
                onChange={(event) => setNameDraft(event.target.value)}
                maxLength={15}
                className="min-w-0 flex-1 rounded-lg border-2 border-salmon-line/50 bg-white/60 px-3 py-2 font-bold text-zinc-900 outline-none focus:border-pine"
              />
              <Button loading={saving} disabled={!nameDraft.trim() || nameDraft.trim() === profile.username} onClick={() => void handleSaveName()}>
                Save
              </Button>
            </div>
            {message ? <p className="mt-2 text-xs font-bold text-zinc-700">{message}</p> : null}
          </div>
        </section>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Points" value={profile.total_points} />
          <Stat label="Games" value={profile.games_played} />
          <Stat label="Wins" value={profile.wins} />
          <Stat label="Win rate" value={`${winRate}%`} />
        </div>

        <section className="mt-8">
          <h2 className="text-sm font-extrabold uppercase tracking-widest text-pine/70">Recent games</h2>
          <div className="mt-3 overflow-hidden rounded-lg border-2 border-salmon-line/50 shadow-card">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-salmon text-zinc-900">
                <tr className="text-[11px] font-extrabold uppercase tracking-widest">
                  <th className="px-4 py-3">Room</th>
                  <th className="px-4 py-3">Placement</th>
                  <th className="px-4 py-3">Points</th>
                  <th className="px-4 py-3">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-salmon-line/25 bg-parchment-raised text-zinc-800">
                {loadingGames ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-6">
                      <div className="h-5 animate-pulse rounded bg-salmon/30" />
                    </td>
                  </tr>
                ) : games.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center font-bold text-pine/50">
                      No finished games yet — play one and it&apos;ll show up here.
                    </td>
                  </tr>
                ) : (
                  games.map((game) => (
                    <tr key={game.id}>
                      <td className="px-4 py-3 font-mono text-xs font-bold">{game.game_id}</td>
                      <td className="px-4 py-3 font-extrabold">
                        {game.placement === 1 ? '🏆 1st' : `#${game.placement}`}
                      </td>
                      <td className="px-4 py-3 font-semibold">{game.points_earned}</td>
                      <td className="px-4 py-3 text-xs font-semibold text-ink-muted">
                        {new Date(game.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <button
          onClick={() => void signOut().then(() => router.push('/'))}
          className="mt-8 text-xs font-extrabold uppercase tracking-wide text-danger transition-opacity hover:opacity-70"
        >
          Sign out
        </button>
      </div>
      <PropertyStrip position="bottom" />
    </main>
  )
}
