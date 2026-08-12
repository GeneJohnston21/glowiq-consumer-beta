'use client'
import { useState } from 'react'

const FF = "Georgia,'Times New Roman',serif", FS = "system-ui,sans-serif"
const G = '#2C4A72', TX = '#141C2B', MU = '#4A5B76', BR = '#C2CCE0'

const URG = {
  routine:   { label:'No Concern',           tx:'#14532D', bg:'rgba(21,128,61,.1)',  br:'rgba(21,128,61,.3)'  },
  soon:      { label:'See Doctor Soon',      tx:'#7C2D12', bg:'rgba(146,64,14,.1)',  br:'rgba(146,64,14,.3)'  },
  urgent:    { label:'See Doctor Promptly',  tx:'#C2410C', bg:'rgba(194,65,12,.1)',  br:'rgba(194,65,12,.3)'  },
  emergency: { label:'Seek Care Today',      tx:'#B91C1C', bg:'rgba(185,28,28,.1)',  br:'rgba(185,28,28,.3)'  },
}

export default function SkinPanel({ entry, photoUrl }) {
  const [open, setOpen] = useState(false)
  const result   = entry.result || {}
  const findings = result.findings || []
  const top      = findings[0]
  const worstUrg = findings.reduce((w,f) => {
    const o = ['routine','soon','urgent','emergency']
    return o.indexOf(f.urgency) > o.indexOf(w) ? f.urgency : w
  }, 'routine')
  const u = URG[worstUrg] || URG.routine
  const needsAttention = worstUrg === 'urgent' || worstUrg === 'emergency'

  return (
    <div style={{ background:'white', border: needsAttention ? `1px solid ${u.br}` : `1px solid ${BR}`,
      borderRadius:12, overflow:'hidden',
      boxShadow: needsAttention ? `0 0 0 1px ${u.br}` : 'none' }}>
      {/* Header row */}
      <div onClick={() => setOpen(o => !o)}
        style={{ display:'flex', alignItems:'center', gap:16, padding:'16px 20px', cursor:'pointer' }}>
        {(photoUrl || entry.thumb) && (
          <img src={photoUrl || entry.thumb} alt="" style={{ width:56, height:56, borderRadius:8, objectFit:'cover', flexShrink:0 }} />
        )}
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontFamily:FF, fontSize:16, fontStyle:'italic', color:TX, marginBottom:4 }}>
            {top?.condition || 'Skin Check'}
            {findings.length > 1 && <span style={{ fontFamily:FS, fontSize:12, color:MU, fontStyle:'normal' }}> +{findings.length - 1} more</span>}
          </div>
          <div style={{ fontFamily:FS, fontSize:12, color:MU }}>
            {new Date(entry.date).toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric' })}
            {' · '}{findings.length} finding{findings.length !== 1 ? 's' : ''}
          </div>
        </div>
        <span style={{ fontFamily:FS, fontSize:11, fontWeight:600, color:u.tx, background:u.bg,
          border:`1px solid ${u.br}`, padding:'3px 10px', borderRadius:12, flexShrink:0 }}>{u.label}</span>
        <span style={{ fontFamily:FS, fontSize:14, color:MU, flexShrink:0 }}>{open ? '▾' : '▸'}</span>
      </div>

      {/* Expanded detail */}
      {open && (
        <div style={{ borderTop:`1px solid ${BR}`, padding:'16px 20px' }}>
          {findings.map((f, i) => {
            const fu = URG[f.urgency] || URG.routine
            return (
              <div key={f.id || i} style={{ marginBottom: i < findings.length-1 ? 16 : 0,
                paddingBottom: i < findings.length-1 ? 16 : 0,
                borderBottom: i < findings.length-1 ? `1px solid ${BR}` : 'none' }}>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
                  <span style={{ fontFamily:FS, fontSize:11, fontWeight:700, color:'white', background:fu.tx,
                    width:20, height:20, borderRadius:10, display:'inline-flex', alignItems:'center', justifyContent:'center' }}>{i+1}</span>
                  <span style={{ fontFamily:FF, fontSize:15, fontStyle:'italic', color:TX }}>{f.condition}</span>
                  <span style={{ fontFamily:FS, fontSize:10, fontWeight:600, color:fu.tx, background:fu.bg,
                    border:`1px solid ${fu.br}`, padding:'2px 8px', borderRadius:10 }}>{fu.label}</span>
                  {f.confidence && <span style={{ fontFamily:FS, fontSize:11, color:MU }}>({f.confidence} confidence)</span>}
                </div>
                {f.description && <p style={{ fontFamily:FS, fontSize:13, color:TX, lineHeight:1.6, margin:'0 0 8px' }}>{f.description}</p>}
                {(f.differential||[]).length > 0 && (
                  <div style={{ fontFamily:FS, fontSize:12, color:MU, marginBottom:8 }}>
                    <strong>Differential:</strong> {f.differential.join(', ')}
                  </div>
                )}
                {f.seekCareWhen && (
                  <div style={{ fontFamily:FS, fontSize:12, color:'#7C2D12', background:'rgba(124,45,18,.05)',
                    padding:'8px 12px', borderRadius:8, marginBottom:8 }}>
                    <strong>Seek care when:</strong> {f.seekCareWhen}
                  </div>
                )}
                {(f.redFlags||[]).length > 0 && (
                  <div style={{ fontFamily:FS, fontSize:12, color:'#B91C1C', background:'rgba(185,28,28,.05)',
                    padding:'8px 12px', borderRadius:8 }}>
                    <strong>Red flags:</strong> {f.redFlags.join(' · ')}
                  </div>
                )}
              </div>
            )
          })}
          {result.photoNote && (
            <div style={{ fontFamily:FS, fontSize:11, color:MU, marginTop:12, fontStyle:'italic' }}>
              Photo quality: {result.photoQuality} — {result.photoNote}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
