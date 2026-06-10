import { supabaseAdmin } from '@/lib/supabase-admin'
import FeedbackList from './FeedbackList'

export const dynamic = 'force-dynamic'

const FF = "Georgia,'Times New Roman',serif", FS = "system-ui,sans-serif"
const TX = '#141C2B', MU = '#4A5B76'

export default async function FeedbackPage({ searchParams }) {
  const filter = (await searchParams)?.type || 'All'

  let query = supabaseAdmin.from('feedback').select('*').order('created_at', { ascending:false })
  if (filter !== 'All') query = query.eq('type', filter)

  const { data: items = [] } = await query

  // Enrich with user emails
  const userIds = [...new Set(items.filter(i => i.user_id).map(i => i.user_id))]
  const emailMap = {}
  if (userIds.length > 0) {
    await Promise.all(userIds.map(async id => {
      const { data: { user } } = await supabaseAdmin.auth.admin.getUserById(id)
      if (user) emailMap[id] = user.email
    }))
  }

  const enriched = items.map(i => ({ ...i, userEmail: emailMap[i.user_id] || null }))

  return (
    <div>
      <div style={{ marginBottom:28 }}>
        <h1 style={{ fontFamily:FF, fontSize:32, fontWeight:300, color:TX, margin:0, fontStyle:'italic' }}>Feedback</h1>
        <p style={{ fontFamily:FS, fontSize:13, color:MU, margin:'6px 0 0' }}>
          {enriched.length} submission{enriched.length !== 1 ? 's' : ''}
        </p>
      </div>
      <FeedbackList items={enriched} activeFilter={filter} />
    </div>
  )
}
