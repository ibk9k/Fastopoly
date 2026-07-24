import type { PlayerResult } from './scoring'
import type { Player } from '@/lib/liveblocks.config'
import { supabaseAdmin } from '@/lib/supabase/server'

/**
 * Writes final scores to Supabase, crediting each result to the seat's authenticated
 * Supabase user id (`player.authUserId`).
 *
 * Previously this guessed identity by username, which broke on renames and could merge
 * two different people who picked the same name. Now the auth uid is the identity, so
 * stats follow the account across devices and display-name changes. Seats with no auth
 * uid (legacy games started before accounts) are skipped rather than mis-credited.
 *
 * Idempotency is the caller's responsibility (guard on `storage.resultsPersisted`).
 */
export async function persistGameResults(roomId: string, results: PlayerResult[], players: Player[]): Promise<void> {
  const authIdByPlayerId = new Map(players.map((player) => [player.id, player.authUserId]))

  const creditable = results
    .map((result) => ({ result, userId: authIdByPlayerId.get(result.playerId) }))
    .filter((entry): entry is { result: PlayerResult; userId: string } => Boolean(entry.userId))

  if (creditable.length === 0) {
    await supabaseAdmin.from('public_rooms').update({ status: 'finished' }).eq('id', roomId)
    return
  }

  // Bump each profile's aggregates. Profiles are created by the auth signup trigger,
  // so a missing row means the account was deleted mid-game — skip it rather than fail.
  for (const { result, userId } of creditable) {
    const { data: existing, error: selectError } = await supabaseAdmin
      .from('profiles')
      .select('total_points,games_played,wins')
      .eq('id', userId)
      .maybeSingle()
    if (selectError) throw new Error(`Profile lookup failed: ${selectError.message}`)
    if (!existing) continue

    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({
        total_points: (existing.total_points ?? 0) + result.pointsEarned,
        games_played: (existing.games_played ?? 0) + 1,
        wins: (existing.wins ?? 0) + (result.placement === 1 ? 1 : 0),
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)
    if (updateError) throw new Error(`Profile update failed: ${updateError.message}`)
  }

  const { error: resultsError } = await supabaseAdmin.from('game_results').insert(
    creditable.map(({ result, userId }) => ({
      game_id: roomId,
      user_id: userId,
      placement: result.placement,
      points_earned: result.pointsEarned,
      bonuses: result.bonuses,
    })),
  )
  if (resultsError) throw new Error(`Game results insert failed: ${resultsError.message}`)

  await supabaseAdmin.from('public_rooms').update({ status: 'finished' }).eq('id', roomId)
}
