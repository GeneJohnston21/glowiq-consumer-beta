import '../globals.css'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

export default async function AdminLayout({ children }) {
  // Full auth + admin whitelist check (server-side, Node.js runtime)
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        get:    (name) => cookieStore.get(name)?.value,
        set:    () => {},
        remove: () => {},
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const adminEmails = (process.env.ADMIN_EMAILS || '')
    .split(',').map(e => e.trim().toLowerCase())
  if (!adminEmails.includes(user.email.toLowerCase())) {
    redirect('/login?error=unauthorized')
  }

  // Feedback badge count
  let feedbackCount = 0
  try {
    const { count } = await supabaseAdmin
      .from('feedback')
      .select('*', { count: 'exact', head: true })
      .is('read_at', null)
    feedbackCount = count || 0
  } catch {}

  return (
    <div style={{ display:'flex', minHeight:'100vh' }}>
      <Sidebar feedbackCount={feedbackCount} />
      <main style={{ flex:1, padding:'36px 40px', minWidth:0, overflowX:'auto' }}>
        {children}
      </main>
    </div>
  )
}
