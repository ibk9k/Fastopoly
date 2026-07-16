'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import PropertyStrip from '@/components/ui/PropertyStrip'

type LeaderboardUser = {
  username: string
  total_points: number
  wins: number
  games_played: number
}

export default function LeaderboardPage() {
  const [users, setUsers] = useState<LeaderboardUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchLeaderboard() {
      setLoading(true)
      const { data, error: queryError } = await supabase
        .from('users')
        .select('username,total_points,wins,games_played')
        .order('total_points', { ascending: false })
        .limit(10)

      if (queryError) {
        setError(queryError.message)
      } else {
        setUsers(data ?? [])
      }
      setLoading(false)
    }

    void fetchLeaderboard()
  }, [])

  return (
    <main className="relative min-h-screen bg-parchment px-6 py-16 text-pine">
      <PropertyStrip position="top" />
      <div className="mx-auto max-w-4xl">
        <div className="flex items-center justify-between gap-4">
          <h1 className="font-display text-4xl uppercase tracking-wide">Leaderboard</h1>
          <Link
            href="/"
            className="rounded-md border-2 border-salmon-line/50 bg-parchment-raised px-4 py-2 text-sm font-extrabold uppercase tracking-wide text-pine transition-colors hover:border-pine/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-pine"
          >
            Back home
          </Link>
        </div>

        <div className="mt-8 overflow-hidden rounded-lg border-2 border-salmon-line/50 shadow-card">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-salmon text-zinc-900">
              <tr className="text-[11px] font-extrabold uppercase tracking-widest">
                <th className="px-4 py-3">Rank</th>
                <th className="px-4 py-3">Username</th>
                <th className="px-4 py-3">Total points</th>
                <th className="px-4 py-3">Wins</th>
                <th className="px-4 py-3">Games played</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-salmon-line/25 bg-parchment-raised text-zinc-800">
              {loading
                ? Array.from({ length: 5 }).map((_, index) => (
                    <tr key={index}>
                      <td colSpan={5} className="px-4 py-4">
                        <div className="h-5 animate-pulse rounded bg-salmon/30" />
                      </td>
                    </tr>
                  ))
                : users.map((user, index) => (
                    <tr key={user.username}>
                      <td className="px-4 py-4 font-display text-pine/70">{index + 1}</td>
                      <td className="px-4 py-4 font-extrabold">{user.username}</td>
                      <td className="px-4 py-4 font-semibold">{user.total_points}</td>
                      <td className="px-4 py-4 font-semibold">{user.wins}</td>
                      <td className="px-4 py-4 font-semibold">{user.games_played}</td>
                    </tr>
                  ))}
              {!loading && users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center font-bold text-pine/50">
                    {error ?? 'No games finished yet — the first winners will show up here.'}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
      <PropertyStrip position="bottom" />
    </main>
  )
}
