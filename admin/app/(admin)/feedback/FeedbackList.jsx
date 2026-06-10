'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

const FS = "system-ui,sans-serif", FF = "Georgia,'Times New Roman',serif"
const TX = '#141C2B', MU = '#4A5B76', BR = '#C2CCE0', G = '#2C4A72'

const TYPE_COLORS = {
  Bug:        { tx:'#B91C1C', bg:'rgba(185,28,28,.1)',  br:'rgba(185,28,28,.3)'  },
  Suggestion: { tx:'#7C2D12', bg:'rgba(146,64,14,.1)',  br:'rgba(146,64,14,.3)'  },
  General:    { tx:'#14532D', bg:'rgba(21,128,61,.1)',   br:'rgba(21,128,61,.3)'  },
}

const fmtDate = (d) => new Date(d).toLocaleDateString('en-US', {
  month:'short', day:'numeric', year:'numeric', hour:'2-digit', minute:'2-digit'
})

export default function FeedbackList({ items, activeFilter }) {
  const router     = useRouter()
  const [shot, setShot] = useState(null)
  const [filter, setFilter] = useState(activeFilter)

  const setF = (f) => {
    setFilter(f)
    router.replace(`/feedback${f !== 'All' ? '?type='+f : ''}`, { scroll:false })
  }

  const filtered = filter === 'All' ? items : items.filter(i => i.type === filter)

  return (
    <div>
      {/* Filter tabs */}
      <div style={{ display:'flex', gap:8, marginBottom:20 }}>
        {['All','Bug','Suggestion','General'].map(f => {
          const active = filter === f
          const c = f !== 'All' ? TYPE_COLORS[f] : null
          return (
            <button key={f} onClick={() => setF(f)}
              style={{ padding:'6px 16px', borderRadius:16, fontFamily:FS, fontSize:12, cursor:'pointer',
                background: active ? (c?.bg || 'rgba(44,74,114,.1)') : 'white',
                border: `1px solid ${active ? (c?.br || 'rgba(44,74,114,.3)') : BR}`,
                color: active ? (c?.tx || G) : MU }}>
              {f}
            </button>
          )
        })}
      </div>

      {/* Items */}
      <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
        {filtered.length === 0 && (
          <div style={{ background:'white', border:`1px solid ${BR}`, borderRadius:12, padding:'40px',
            textAlign:'center', fontFamily:FS, fontSize:14, color:MU }}>No feedback yet</div>
        )}
        {filtered.map(item => {
          const c = TYPE_COLORS[item.type] || TYPE_COLORS.General
          return (
            <div key={item.id} style={{ background:'white', border:`1px solid ${BR}`, borderRadius:12, padding:'20px 24px' }}>
              <div style={{ display:'flex', alignItems:'flex-start', gap:12, marginBottom:10 }}>
                <span style={{ padding:'3px 10px', borderRadius:12, fontFamily:FS, fontSize:11,
                  fontWeight:500, background:c.bg, border:`1px solid ${c.br}`, color:c.tx, flexShrink:0 }}>
                  {item.type}
                </span>
                <div style={{ flex:1 }}>
                  <div style={{ fontFamily:FS, fontSize:12, color:MU }}>{item.userEmail || 'Anonymous'}</div>
                  <div style={{ fontFamily:FS, fontSize:11, color:MU, marginTop:2 }}>
                    {item.context && <span style={{ marginRight:8 }}>Screen: {item.context}</span>}
                    {fmtDate(item.created_at)}
                  </div>
                </div>
              </div>
              <p style={{ fontFamily:FS, fontSize:14, color:TX, lineHeight:1.65, margin:'0 0 12px' }}>
                {item.message}
              </p>
              {item.screenshot && (
                <img src={item.screenshot} alt="screenshot"
                  onClick={() => setShot(item.screenshot)}
                  style={{ maxWidth:240, borderRadius:8, border:`1px solid ${BR}`, cursor:'pointer',
                    display:'block' }} />
              )}
            </div>
          )
        })}
      </div>

      {/* Screenshot lightbox */}
      {shot && (
        <div onClick={() => setShot(null)}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.8)', display:'flex',
            alignItems:'center', justifyContent:'center', zIndex:1000, padding:24, cursor:'pointer' }}>
          <img src={shot} alt="Screenshot" style={{ maxWidth:'90vw', maxHeight:'90vh',
            borderRadius:12, boxShadow:'0 20px 60px rgba(0,0,0,.5)' }} />
        </div>
      )}
    </div>
  )
}
