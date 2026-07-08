'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'

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
    <main className="min-h-screen bg-[#0a0a0a] px-6 py-16 text-white">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-4xl font-bold">Leaderboard</h1>
          <Link href="/" className="rounded-md border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-200 hover:border-zinc-500">
            Back home
          </Link>
        </div>

        <div className="mt-8 overflow-hidden rounded-lg border border-zinc-800">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-zinc-900 text-zinc-300">
              <tr>
                <th className="px-4 py-3">Rank</th>
                <th className="px-4 py-3">Username</th>
                <th className="px-4 py-3">Total points</th>
                <th className="px-4 py-3">Wins</th>
                <th className="px-4 py-3">Games played</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800 bg-zinc-950">
              {loading
                ? Array.from({ length: 5 }).map((_, index) => (
                    <tr key={index}>
                      <td colSpan={5} className="px-4 py-4">
                        <div className="h-5 animate-pulse rounded bg-zinc-800" />
                      </td>
                    </tr>
                  ))
                : users.map((user, index) => (
                    <tr key={user.username}>
                      <td className="px-4 py-4 text-zinc-400">{index + 1}</td>
                      <td className="px-4 py-4 font-semibold">{user.username}</td>
                      <td className="px-4 py-4">{user.total_points}</td>
                      <td className="px-4 py-4">{user.wins}</td>
                      <td className="px-4 py-4">{user.games_played}</td>
                    </tr>
                  ))}
              {!loading && users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-zinc-500">
                    {error ?? 'No scores yet.'}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  )
}
