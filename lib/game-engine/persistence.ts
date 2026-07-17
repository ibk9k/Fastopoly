import type { PlayerResult } from './scoring'
import { supabaseAdmin } from '@/lib/supabase/server'

/**
 * Writes final scores to Supabase, resolving each player's username to a real
 * `users` row uuid first. The previous code inserted `player-N` strings into a
 * uuid FK column, so every write silently failed and the leaderboard stayed
 * empty. Errors are surfaced (thrown), not swallowed.
 *
 * Idempotency is the caller's responsibility (guard on `storage.resultsPersisted`).
 */
export async function persistGameResults(roomId: string, results: PlayerResult[]): Promise<void> {
  // Resolve/create a users row per username → uuid, and bump their aggregates.
  const idByUsername = new Map<string, string>()
  for (const result of results) {
    const { data: existing, error: selectError } = await supabaseAdmin
      .from('users')
      .select('id,total_points,games_played,wins')
      .eq('username', result.username)
      .maybeSingle()
    if (selectError) throw new Error(`Leaderboard lookup failed: ${selectError.message}`)

    if (existing) {
      idByUsername.set(result.username, existing.id)
      const { error: updateError } = await supabaseAdmin
        .from('users')
        .update({
          total_points: (existing.total_points ?? 0) + result.pointsEarned,
          games_played: (existing.games_played ?? 0) + 1,
          wins: (existing.wins ?? 0) + (result.placement === 1 ? 1 : 0),
        })
        .eq('id', existing.id)
      if (updateError) throw new Error(`Leaderboard update failed: ${updateError.message}`)
    } else {
      const { data: inserted, error: insertError } = await supabaseAdmin
        .from('users')
        .insert({
          username: result.username,
          total_points: result.pointsEarned,
          games_played: 1,
          wins: result.placement === 1 ? 1 : 0,
        })
        .select('id')
        .single()
      if (insertError || !inserted) throw new Error(`Leaderboard insert failed: ${insertError?.message ?? 'no row'}`)
      idByUsername.set(result.username, inserted.id)
    }
  }

  const { error: resultsError } = await supabaseAdmin.from('game_results').insert(
    results.map((result) => ({
      game_id: roomId,
      user_id: idByUsername.get(result.username),
      placement: result.placement,
      points_earned: result.pointsEarned,
      bonuses: result.bonuses,
    })),
  )
  if (resultsError) throw new Error(`Game results insert failed: ${resultsError.message}`)

  await supabaseAdmin.from('public_rooms').update({ status: 'finished' }).eq('id', roomId)
}
