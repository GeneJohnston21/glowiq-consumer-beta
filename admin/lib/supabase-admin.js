import { createClient } from '@supabase/supabase-js'

// Lazy initialisation — only created when first called, not at module load time
let _admin = null

export const getSupabaseAdmin = () => {
  if (!_admin) {
    _admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
  }
  return _admin
}

// Keep named export for compatibility
export const supabaseAdmin = new Proxy({}, {
  get: (_, prop) => getSupabaseAdmin()[prop]
})
