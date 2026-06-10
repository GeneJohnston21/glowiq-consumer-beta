import { supabaseAdmin } from '@/lib/supabase-admin'
import UsersTable from './UsersTable'

export const dynamic = 'force-dynamic'

const FF = "Georgia,'Times New Roman',serif", FS = "system-ui,sans-serif"
const TX = '#141C2B', MU = '#4A5B76'

export default async function UsersPage({ searchParams }) {
  const q = (await searchParams)?.q?.toLowerCase() || ''

  const [{ data: { users } = { users:[] } }, { data: storage }] = await Promise.all([
    supabaseAdmin.auth.admin.listUsers({ perPage: 1000 }),
    supabaseAdmin.from('user_storage').select('user_id, key, value').in('key', ['glow:profile','glow:index']),
  ])

  // Map storage by user
  const byUser = {}
  storage?.forEach(row => {
    if (!byUser[row.user_id]) byUser[row.user_id] = {}
    byUser[row.user_id][row.key] = row.value
  })

  const enriched = users.map(u => {
    let profile = {}, analyses = []
    try { profile  = JSON.parse(byUser[u.id]?.['glow:profile'] || '{}') } catch {}
    try { analyses = JSON.parse(byUser[u.id]?.['glow:index']   || '[]') } catch {}
    return {
      id:            u.id,
      email:         u.email,
      name:          profile.name || null,
      createdAt:     u.created_at,
      lastActive:    u.last_sign_in_at,
      analysisCount: analyses.length,
      skinType:      profile.fitzpatrickType || null,
    }
  }).filter(u => !q || u.email.includes(q) || (u.name||'').toLowerCase().includes(q))
    .sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt))

  return (
    <div>
      <div style={{ marginBottom:28 }}>
        <h1 style={{ fontFamily:FF, fontSize:32, fontWeight:300, color:TX, margin:0, fontStyle:'italic' }}>Users</h1>
        <p style={{ fontFamily:FS, fontSize:13, color:MU, margin:'6px 0 0' }}>{enriched.length} user{enriched.length !== 1 ? 's' : ''}{q ? ` matching "${q}"` : ''}</p>
      </div>
      <UsersTable users={enriched} initialQ={q} />
    </div>
  )
}
