import { supabaseAdmin } from '@/lib/supabase-admin'
import BillingClient from './BillingClient'

export const dynamic = 'force-dynamic'

const FF = "Georgia,'Times New Roman',serif", FS = "system-ui,sans-serif"
const TX = '#141C2B', MU = '#4A5B76'

export default async function BillingPage() {
  const { data: { users } = { users:[] } } = await supabaseAdmin.auth.admin.listUsers({ perPage:1000 })

  // Build monthly active user counts for last 13 months
  const now = new Date()
  const months = []
  for (let i = 12; i >= 0; i--) {
    const d     = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const start = d.toISOString()
    const end   = new Date(d.getFullYear(), d.getMonth()+1, 1).toISOString()
    const label = d.toLocaleDateString('en-US', { month:'short', year:'numeric' })
    const count = users.filter(u => u.last_sign_in_at && u.last_sign_in_at >= start && u.last_sign_in_at < end).length
    months.push({ label, year:d.getFullYear(), month:d.getMonth()+1, count, start, end })
  }

  return (
    <div>
      <div style={{ marginBottom:28 }}>
        <h1 style={{ fontFamily:FF, fontSize:32, fontWeight:300, color:TX, margin:0, fontStyle:'italic' }}>Billing</h1>
        <p style={{ fontFamily:FS, fontSize:13, color:MU, margin:'6px 0 0' }}>
          Active users per month · Defined as at least one login
        </p>
      </div>
      <BillingClient months={months} totalUsers={users.length} />
    </div>
  )
}
