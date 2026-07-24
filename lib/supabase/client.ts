'use client'

import { createBrowserClient } from '@supabase/ssr'

/**
 * Browser-side Supabase client. Uses @supabase/ssr so the auth session is stored in
 * cookies rather than localStorage — that's what lets server routes and middleware
 * read the same session (needed to bind a game seat to the signed-in user).
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://example.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key',
  )
}

/** Shared singleton for components that only need to read/query. */
export const supabase = createSupabaseBrowserClient()
