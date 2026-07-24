import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

/** Service-role client: bypasses RLS. Server-only, used for all authoritative writes. */
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://example.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-service-role-key',
)

/**
 * Request-scoped client that reads the caller's auth session from cookies.
 * Use this in route handlers / server components to answer "who is calling?" —
 * never trust a user id from a request body.
 */
export function createSupabaseServerClient() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://example.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key',
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          } catch {
            // Called from a Server Component: middleware refreshes the session instead.
          }
        },
      },
    },
  )
}

/**
 * Returns the authenticated user for the current request, or null.
 * Uses getUser() (which revalidates against the auth server) rather than
 * getSession(), so a forged cookie can't impersonate anyone.
 */
export async function getRequestUser() {
  const supabase = createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}
