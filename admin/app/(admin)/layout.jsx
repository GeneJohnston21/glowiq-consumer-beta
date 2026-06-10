import '../globals.css'
import Sidebar from '@/components/Sidebar'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

export default async function AdminLayout({ children }) {
  const { count } = await supabaseAdmin
    .from('feedback')
    .select('*', { count:'exact', head:true })
    .is('read_at', null)
    .catch(() => ({ count: 0 }))

  return (
    <div style={{ display:'flex', minHeight:'100vh' }}>
      <Sidebar feedbackCount={count || 0} />
      <main style={{ flex:1, padding:'36px 40px', minWidth:0, overflowX:'auto' }}>
        {children}
      </main>
    </div>
  )
}
