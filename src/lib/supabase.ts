import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
// The anon/publishable key is designed to be public. Data access must be
// protected with Row Level Security in Supabase, never by hiding this key.
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          // PKCE keeps tokens out of the URL fragment for email links and OAuth.
          flowType: 'pkce',
        },
      })
    : null

export const isAuthConfigured = supabase !== null
