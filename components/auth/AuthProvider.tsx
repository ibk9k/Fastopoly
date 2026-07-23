'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase/client'

export type Profile = {
  id: string
  username: string
  avatar_url: string | null
  is_guest: boolean
  total_points: number
  games_played: number
  wins: number
}

type AuthContextValue = {
  user: User | null
  profile: Profile | null
  loading: boolean
  /** True once we know whether someone is signed in (avoids UI flicker). */
  ready: boolean
  signInAsGuest: (username: string) => Promise<{ error?: string }>
  signInWithGoogle: () => Promise<{ error?: string }>
  signInWithEmail: (email: string, password: string) => Promise<{ error?: string }>
  signUpWithEmail: (email: string, password: string, username: string) => Promise<{ error?: string; needsConfirmation?: boolean }>
  updateUsername: (username: string) => Promise<{ error?: string }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

const USERNAME_KEY = 'fastopoly_username'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(false)
  const [ready, setReady] = useState(false)

  const loadProfile = useCallback(async (userId: string | undefined) => {
    if (!userId) {
      setProfile(null)
      return
    }
    const { data } = await supabase
      .from('profiles')
      .select('id,username,avatar_url,is_guest,total_points,games_played,wins')
      .eq('id', userId)
      .maybeSingle()
    setProfile((data as Profile) ?? null)
    // Keep the legacy key in sync so presence//game code keeps working unchanged.
    if (data?.username && typeof window !== 'undefined') {
      window.localStorage.setItem(USERNAME_KEY, data.username)
      window.sessionStorage.setItem(USERNAME_KEY, data.username)
    }
  }, [])

  useEffect(() => {
    let active = true
    supabase.auth.getUser().then(({ data }) => {
      if (!active) return
      setUser(data.user ?? null)
      void loadProfile(data.user?.id).finally(() => setReady(true))
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      void loadProfile(session?.user?.id)
    })

    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [loadProfile])

  const refreshProfile = useCallback(async () => {
    await loadProfile(user?.id)
  }, [loadProfile, user?.id])

  const signInAsGuest = useCallback(
    async (username: string) => {
      setLoading(true)
      try {
        // Already signed in? Just adopt the new display name.
        const { data: existing } = await supabase.auth.getUser()
        if (existing.user) {
          const { error } = await supabase.from('profiles').update({ username, updated_at: new Date().toISOString() }).eq('id', existing.user.id)
          if (error) return { error: error.message }
          await loadProfile(existing.user.id)
          return {}
        }
        const { error } = await supabase.auth.signInAnonymously({ options: { data: { username } } })
        if (error) return { error: error.message }
        return {}
      } finally {
        setLoading(false)
      }
    },
    [loadProfile],
  )

  const signInWithGoogle = useCallback(async () => {
    setLoading(true)
    try {
      const redirectTo = `${window.location.origin}/auth/callback`
      const { data: existing } = await supabase.auth.getUser()
      // Guest upgrading: link Google to the SAME account so stats carry over.
      if (existing.user?.is_anonymous) {
        const { error } = await supabase.auth.linkIdentity({ provider: 'google', options: { redirectTo } })
        if (!error) return {}
        // Manual linking may be disabled in the project; fall through to a normal sign-in.
      }
      const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } })
      if (error) return { error: error.message }
      return {}
    } finally {
      setLoading(false)
    }
  }, [])

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    setLoading(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) return { error: error.message }
      return {}
    } finally {
      setLoading(false)
    }
  }, [])

  const signUpWithEmail = useCallback(
    async (email: string, password: string, username: string) => {
      setLoading(true)
      try {
        const { data: existing } = await supabase.auth.getUser()
        // Guest upgrading to a real account keeps the same uid — and therefore the stats.
        if (existing.user?.is_anonymous) {
          const { error } = await supabase.auth.updateUser({ email, password, data: { username } })
          if (error) return { error: error.message }
          await supabase.from('profiles').update({ username, is_guest: false, updated_at: new Date().toISOString() }).eq('id', existing.user.id)
          await loadProfile(existing.user.id)
          return { needsConfirmation: true }
        }

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { username }, emailRedirectTo: `${window.location.origin}/auth/callback` },
        })
        if (error) return { error: error.message }
        // No session back means the project requires email confirmation.
        return { needsConfirmation: !data.session }
      } finally {
        setLoading(false)
      }
    },
    [loadProfile],
  )

  const updateUsername = useCallback(
    async (username: string) => {
      if (!user) return { error: 'Not signed in' }
      const { error } = await supabase
        .from('profiles')
        .update({ username, updated_at: new Date().toISOString() })
        .eq('id', user.id)
      if (error) return { error: error.message }
      await loadProfile(user.id)
      return {}
    },
    [loadProfile, user],
  )

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setProfile(null)
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(USERNAME_KEY)
      window.sessionStorage.removeItem(USERNAME_KEY)
    }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      profile,
      loading,
      ready,
      signInAsGuest,
      signInWithGoogle,
      signInWithEmail,
      signUpWithEmail,
      updateUsername,
      signOut,
      refreshProfile,
    }),
    [user, profile, loading, ready, signInAsGuest, signInWithGoogle, signInWithEmail, signUpWithEmail, updateUsername, signOut, refreshProfile],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>')
  return context
}
