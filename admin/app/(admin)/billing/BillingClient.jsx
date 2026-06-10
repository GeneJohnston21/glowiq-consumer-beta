'use client'

const FS = "system-ui,sans-serif", FF = "Georgia,'Times New Roman',serif"
const TX = '#141C2B', MU = '#4A5B76', BR = '#C2CCE0', G = '#2C4A72'

export default function BillingClient({ months, totalUsers }) {
  const max     = Math.max(...months.map(m => m.count), 1)
  const current = months[months.length - 1]

  const exportCSV = async (year, month) => {
    window.location.href = `/api/export?year=${year}&month=${month}`
  }

  return (
    <div>
      {/* Summary cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))', gap:16, marginBottom:32 }}>
        {[
          { label:'Total Users',           value: totalUsers,        sub:'All time' },
          { label:`Active — ${current.label}`, value: current.count, sub:'Current month', color:G },
          { label:`Active — ${months[months.length-2]?.label}`, value: months[months.length-2]?.count, sub:'Previous month' },
        ].map(({ label,value,sub,color }) => (
          <div key={label} style={{ background:'white', border:`1px solid ${BR}`, borderRadius:12, padding:'20px 24px' }}>
            <div style={{ fontFamily:FS, fontSize:11, letterSpacing:'0.1em', color:MU, textTransform:'uppercase', marginBottom:8 }}>{label}</div>
            <div style={{ fontFamily:FF, fontSize:40, fontWeight:300, color:color||TX, lineHeight:1 }}>{value}</div>
            <div style={{ fontFamily:FS, fontSize:12, color:MU, marginTop:4 }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* Bar chart */}
      <div style={{ background:'white', border:`1px solid ${BR}`, borderRadius:12, padding:'24px', marginBottom:24 }}>
        <div style={{ fontFamily:FF, fontSize:18, fontStyle:'italic', color:TX, marginBottom:20 }}>Monthly Active Users</div>
        <div style={{ display:'flex', alignItems:'flex-end', gap:6, height:140 }}>
          {months.map((m, i) => {
            const h  = max > 0 ? Math.max((m.count / max) * 120, m.count > 0 ? 4 : 0) : 0
            const cur = i === months.length - 1
            return (
              <div key={m.label} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
                {m.count > 0 && (
                  <div style={{ fontFamily:FS, fontSize:9, color:cur ? G : MU, fontWeight: cur ? 600 : 400 }}>{m.count}</div>
                )}
                <div style={{ width:'100%', height:`${h}px`, borderRadius:'3px 3px 0 0',
                  background: cur ? G : 'rgba(44,74,114,.25)', transition:'height .3s' }} />
                <div style={{ fontFamily:FS, fontSize:8, color:cur ? G : MU, textAlign:'center',
                  letterSpacing:'0.02em', fontWeight: cur ? 600 : 400, whiteSpace:'nowrap' }}>
                  {m.label.split(' ')[0]}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Monthly breakdown table */}
      <div style={{ background:'white', border:`1px solid ${BR}`, borderRadius:12, overflow:'hidden' }}>
        <div style={{ padding:'16px 24px', borderBottom:`1px solid ${BR}`, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ fontFamily:FF, fontSize:18, fontStyle:'italic', color:TX }}>Monthly Breakdown</div>
          <div style={{ fontFamily:FS, fontSize:11, color:MU }}>Click export to download user list for billing documentation</div>
        </div>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead>
            <tr style={{ background:'#F8F9FC' }}>
              {['Month','Active Users','Change','Export'].map(h => (
                <th key={h} style={{ padding:'10px 24px', textAlign:'left', fontFamily:FS,
                  fontSize:11, fontWeight:600, color:MU, letterSpacing:'0.08em', textTransform:'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...months].reverse().map((m, i) => {
              const prev   = months[months.length - 2 - i]
              const change = prev != null ? m.count - prev.count : null
              const isNew  = i === 0
              return (
                <tr key={m.label} style={{ borderTop:`1px solid ${BR}`, background: isNew ? 'rgba(44,74,114,.03)' : i%2===0?'white':'#FAFBFD' }}>
                  <td style={{ padding:'13px 24px' }}>
                    <span style={{ fontFamily:FS, fontSize:13, fontWeight: isNew ? 600 : 400, color:TX }}>{m.label}</span>
                    {isNew && <span style={{ fontFamily:FS, fontSize:10, color:G, marginLeft:8, letterSpacing:'0.08em', textTransform:'uppercase' }}>Current</span>}
                  </td>
                  <td style={{ padding:'13px 24px', fontFamily:FS, fontSize:15, fontWeight:600, color: isNew ? G : TX }}>{m.count}</td>
                  <td style={{ padding:'13px 24px' }}>
                    {change != null && change !== 0 && (
                      <span style={{ fontFamily:FS, fontSize:12,
                        color: change > 0 ? '#14532D' : '#B91C1C' }}>
                        {change > 0 ? '+' : ''}{change}
                      </span>
                    )}
                    {change === 0 && <span style={{ fontFamily:FS, fontSize:12, color:MU }}>—</span>}
                  </td>
                  <td style={{ padding:'13px 24px' }}>
                    <button onClick={() => exportCSV(m.year, m.month)}
                      style={{ padding:'5px 12px', borderRadius:6, background:'transparent',
                        border:`1px solid ${BR}`, fontFamily:FS, fontSize:11, color:MU, cursor:'pointer',
                        letterSpacing:'0.06em', textTransform:'uppercase' }}>
                      CSV ↓
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {/* Provider billing placeholder */}
        <div style={{ padding:'20px 24px', borderTop:`1px solid ${BR}`, background:'#FAFBFD' }}>
          <div style={{ fontFamily:FS, fontSize:11, letterSpacing:'0.1em', color:MU, textTransform:'uppercase', marginBottom:4 }}>Provider Billing</div>
          <div style={{ fontFamily:FS, fontSize:13, color:MU, fontStyle:'italic' }}>
            Per-practice active user billing will appear here once providers are onboarded.
          </div>
        </div>
      </div>
    </div>
  )
}
