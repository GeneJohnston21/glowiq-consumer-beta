import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

const FF = "Georgia,'Times New Roman',serif"
const FS = "system-ui,sans-serif"
const G  = '#2C4A72', TX = '#141C2B', MU = '#4A5B76', BR = '#C2CCE0'

function StatCard({ label, value, sub, color }) {
  return (
    <div style={{ background:'white', border:`1px solid ${BR}`, borderRadius:12, padding:'20px 24px' }}>
      <div style={{ fontFamily:FS, fontSize:11, letterSpacing:'0.12em', color:MU, textTransform:'uppercase', marginBottom:8 }}>{label}</div>
      <div style={{ fontFamily:FF, fontSize:42, fontWeight:300, color: color || TX, lineHeight:1 }}>{value}</div>
      {sub && <div style={{ fontFamily:FS, fontSize:12, color:MU, marginTop:6 }}>{sub}</div>}
    </div>
  )
}

export default async function DashboardPage() {
  const now   = new Date()
  const mSt   = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const wAgo  = new Date(now - 7*24*60*60*1000).toISOString()

  const [{ data: { users } = { users:[] } }, { count: fbCount }, { data: storage }] = await Promise.all([
    supabaseAdmin.auth.admin.listUsers({ perPage: 1000 }),
    supabaseAdmin.from('feedback').select('*', { count:'exact', head:true }),
    supabaseAdmin.from('user_storage').select('user_id, value').eq('key','glow:index'),
  ])

  const totalUsers    = users.length
  const newThisWeek   = users.filter(u => u.created_at >= wAgo).length
  const activeThisMon = users.filter(u => u.last_sign_in_at && u.last_sign_in_at >= mSt).length

  let totalAnalyses = 0
  const analysesThisMonth = []
  storage?.forEach(row => {
    try {
      const list = JSON.parse(row.value)
      totalAnalyses += list.length
      list.forEach(e => { if (e.date && e.date >= mSt) analysesThisMonth.push(e) })
    } catch {}
  })

  // Recent signups
  const recent = [...users]
    .sort((a,b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 8)

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }) : '—'

  return (
    <div>
      <div style={{ marginBottom:32 }}>
        <h1 style={{ fontFamily:FF, fontSize:32, fontWeight:300, color:TX, margin:0, fontStyle:'italic' }}>Dashboard</h1>
        <p style={{ fontFamily:FS, fontSize:13, color:MU, margin:'6px 0 0' }}>
          {now.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric' })}
        </p>
      </div>

      {/* Stat cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:16, marginBottom:36 }}>
        <StatCard label="Total Users"        value={totalUsers}      sub="All time"                     />
        <StatCard label="Active This Month"  value={activeThisMon}   sub="At least one login"           color={G} />
        <StatCard label="New This Week"      value={newThisWeek}     sub="Last 7 days"                  />
        <StatCard label="Analyses This Month"value={analysesThisMonth.length} sub="Scans completed"    />
        <StatCard label="Total Analyses"     value={totalAnalyses}   sub="All time"                     />
        <StatCard label="Open Feedback"      value={fbCount || 0}    sub="Unreviewed submissions"       color={fbCount > 0 ? '#B91C1C' : TX} />
      </div>

      {/* Recent signups */}
      <div style={{ background:'white', border:`1px solid ${BR}`, borderRadius:12, overflow:'hidden' }}>
        <div style={{ padding:'16px 24px', borderBottom:`1px solid ${BR}` }}>
          <h2 style={{ fontFamily:FF, fontSize:18, fontWeight:400, color:TX, margin:0, fontStyle:'italic' }}>Recent Signups</h2>
        </div>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead>
            <tr style={{ background:'#F8F9FC' }}>
              {['Email','Signed Up','Last Active'].map(h => (
                <th key={h} style={{ padding:'10px 24px', textAlign:'left', fontFamily:FS, fontSize:11,
                  fontWeight:600, color:MU, letterSpacing:'0.08em', textTransform:'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {recent.map((u, i) => (
              <tr key={u.id} style={{ borderTop:`1px solid ${BR}`, background: i%2===0 ? 'white' : '#FAFBFD' }}>
                <td style={{ padding:'12px 24px' }}>
                  <a href={`/users/${u.id}`} style={{ fontFamily:FS, fontSize:13, color:G, fontWeight:500 }}>{u.email}</a>
                </td>
                <td style={{ padding:'12px 24px', fontFamily:FS, fontSize:13, color:MU }}>{fmtDate(u.created_at)}</td>
                <td style={{ padding:'12px 24px', fontFamily:FS, fontSize:13, color:MU }}>{fmtDate(u.last_sign_in_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ padding:'12px 24px', borderTop:`1px solid ${BR}` }}>
          <a href="/users" style={{ fontFamily:FS, fontSize:12, color:G, letterSpacing:'0.06em' }}>View all users →</a>
        </div>
      </div>
    </div>
  )
}
