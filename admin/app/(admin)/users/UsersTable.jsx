'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

const FS = "system-ui,sans-serif", G = '#2C4A72', TX = '#141C2B', MU = '#4A5B76', BR = '#C2CCE0'

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }) : '—'
const fmtAgo  = (d) => {
  if (!d) return '—'
  const diff = Date.now() - new Date(d)
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days <  7)  return `${days}d ago`
  if (days < 30)  return `${Math.floor(days/7)}w ago`
  return `${Math.floor(days/30)}mo ago`
}

export default function UsersTable({ users, initialQ = '' }) {
  const router  = useRouter()
  const [q, setQ] = useState(initialQ)

  const filtered = users.filter(u =>
    !q || u.email.toLowerCase().includes(q.toLowerCase()) ||
    (u.name||'').toLowerCase().includes(q.toLowerCase())
  )

  const search = (val) => {
    setQ(val)
    const params = new URLSearchParams()
    if (val) params.set('q', val)
    router.replace(`/users${val ? '?'+params : ''}`, { scroll: false })
  }

  return (
    <div>
      <div style={{ marginBottom:16 }}>
        <input value={q} onChange={e => search(e.target.value)}
          placeholder="Search by email or name…"
          style={{ width:'100%', maxWidth:360, padding:'10px 14px', borderRadius:8,
            border:`1px solid ${BR}`, fontFamily:FS, fontSize:13, color:TX, outline:'none' }} />
      </div>

      <div style={{ background:'white', border:`1px solid ${BR}`, borderRadius:12, overflow:'hidden' }}>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead>
            <tr style={{ background:'#F8F9FC' }}>
              {['Name / Email','Signed Up','Last Active','Analyses','Skin Type'].map(h => (
                <th key={h} style={{ padding:'10px 20px', textAlign:'left', fontFamily:FS,
                  fontSize:11, fontWeight:600, color:MU, letterSpacing:'0.08em', textTransform:'uppercase',
                  whiteSpace:'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((u, i) => (
              <tr key={u.id}
                onClick={() => router.push(`/users/${u.id}`)}
                style={{ borderTop:`1px solid ${BR}`, background: i%2===0 ? 'white' : '#FAFBFD',
                  cursor:'pointer', transition:'background .1s' }}
                onMouseEnter={e => e.currentTarget.style.background='#EFF2F8'}
                onMouseLeave={e => e.currentTarget.style.background = i%2===0 ? 'white' : '#FAFBFD'}>
                <td style={{ padding:'13px 20px' }}>
                  <div style={{ fontFamily:FS, fontSize:13, fontWeight:500, color:TX }}>{u.name || <span style={{ color:MU, fontStyle:'italic' }}>No name</span>}</div>
                  <div style={{ fontFamily:FS, fontSize:12, color:MU, marginTop:2 }}>{u.email}</div>
                </td>
                <td style={{ padding:'13px 20px', fontFamily:FS, fontSize:13, color:MU, whiteSpace:'nowrap' }}>{fmtDate(u.createdAt)}</td>
                <td style={{ padding:'13px 20px', fontFamily:FS, fontSize:13, color:MU, whiteSpace:'nowrap' }}>{fmtAgo(u.lastActive)}</td>
                <td style={{ padding:'13px 20px' }}>
                  <span style={{ fontFamily:FS, fontSize:13, fontWeight:600,
                    color: u.analysisCount > 0 ? G : MU }}>{u.analysisCount}</span>
                </td>
                <td style={{ padding:'13px 20px', fontFamily:FS, fontSize:12, color:MU }}>{u.skinType || '—'}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={5} style={{ padding:'32px', textAlign:'center', fontFamily:FS, fontSize:13, color:MU }}>No users found</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
