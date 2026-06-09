import { createBrowserClient } from '@supabase/ssr'

export const createClient = () => {
  if (typeof window === 'undefined') return null
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )
}

let client = null
export const getSupabase = () => {
  if (typeof window === 'undefined') return null
  if (!client) client = createClient()
  return client
}