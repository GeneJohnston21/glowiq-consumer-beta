'use client'
import { useState } from 'react'

const FF = "Georgia,'Times New Roman',serif", FS = "system-ui,sans-serif"
const G = '#2C4A72', TX = '#141C2B', MU = '#4A5B76', BR = '#C2CCE0'

const URG = {
  routine:   { label:'Preventive',          tx:'#14532D', bg:'rgba(21,128,61,.1)',  br:'rgba(21,128,61,.3)'  },
  soon:      { label:'Early Intervention',  tx:'#7C2D12', bg:'rgba(146,64,14,.1)',  br:'rgba(146,64,14,.3)'  },
  urgent:    { label:'Active Loss',         tx:'#C2410C', bg:'rgba(194,65,12,.1)',  br:'rgba(194,65,12,.3)'  },
  emergency: { label:'Consult Today',       tx:'#B91C1C', bg:'rgba(185,28,28,.1)',  br:'rgba(185,28,28,.3)'  },
}

const scoreColor = (s) => !s ? MU : s >= 85 ? '#14532D' : s >= 70 ? '#7C2D12' : s >= 55 ? '#C2410C' : '#B91C1C'
const scoreLabel = (s) => !s ? '—' : s >= 85 ? 'Normal' : s >= 70 ? 'Mildly Reduced' : s >= 55 ? 'Moderately Reduced' : s >= 40 ? 'Significantly Reduced' : 'Severe Loss'

export default function HairPanel({ entry, photoUrl }) {
  const [open, setOpen] = useState(false)
  const result   = entry.result || {}
  const findings = result.findings || []
  const score    = result.densityScore
  const top      = findings[0]
  const worstUrg = findings.reduce((w,f) => {
    const o = ['routine','soon','urgent','emergency']
    return o.indexOf(f.urgency) > o.indexOf(w) ? f.urgency : w
  }, 'routine')
  const u = URG[worstUrg] || URG.routine
  const isSurgicalCandidate = score != null && (score < 45 || worstUrg === 'emergency')

  return (
    <div style={{ background:'white', border:`1px solid ${BR}`, borderRadius:12, overflow:'hidden' }}>
      {/* Header row */}
      <div onClick={() => setOpen(o => !o)}
        style={{ display:'flex', alignItems:'center', gap:16, padding:'16px 20px', cursor:'pointer' }}>
        {(photoUrl || entry.thumb) && (
          <img src={photoUrl || entry.thumb} alt="" style={{ width:56, height:56, borderRadius:8, objectFit:'cover', flexShrink:0 }} />
        )}
        <div style={{ flexShrink:0, textAlign:'center', minWidth:64 }}>
          <div style={{ fontFamily:FF, fontSize:32, color:scoreColor(score), lineHeight:1 }}>{score ?? '—'}</div>
          <div style={{ fontFamily:FS, fontSize:9, color:MU, letterSpacing:'0.08em', textTransform:'uppercase', marginTop:2 }}>Density</div>
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontFamily:FF, fontSize:16, fontStyle:'italic', color:TX, marginBottom:4 }}>
            {top?.condition || 'Hair Analysis'}
          </div>
          <div style={{ fontFamily:FS, fontSize:12, color:MU }}>
            {new Date(entry.date).toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric' })}
            {' · '}{scoreLabel(score)}
          </div>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:6, alignItems:'flex-end', flexShrink:0 }}>
          <span style={{ fontFamily:FS, fontSize:11, fontWeight:600, color:u.tx, background:u.bg,
            border:`1px solid ${u.br}`, padding:'3px 10px', borderRadius:12 }}>{u.label}</span>
          {isSurgicalCandidate && (
            <span style={{ fontFamily:FS, fontSize:11, fontWeight:600, color:'#7C2D12', background:'rgba(124,45,18,.08)',
              border:'1px solid rgba(124,45,18,.3)', padding:'3px 10px', borderRadius:12 }}>MaxGraft Candidate</span>
          )}
        </div>
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
                  <span style={{ fontFamily:FF, fontSize:15, fontStyle:'italic', color:TX }}>{f.condition}</span>
                  <span style={{ fontFamily:FS, fontSize:10, fontWeight:600, color:fu.tx, background:fu.bg,
                    border:`1px solid ${fu.br}`, padding:'2px 8px', borderRadius:10 }}>{fu.label}</span>
                  {f.confidence && <span style={{ fontFamily:FS, fontSize:11, color:MU }}>({f.confidence} confidence)</span>}
                </div>
                {f.description && <p style={{ fontFamily:FS, fontSize:13, color:TX, lineHeight:1.6, margin:'0 0 8px' }}>{f.description}</p>}
                {f.clinicalNote && (
                  <div style={{ fontFamily:FS, fontSize:12, color:'#7C2D12', background:'rgba(124,45,18,.05)',
                    padding:'8px 12px', borderRadius:8, marginBottom:8 }}>
                    <strong>Clinical note:</strong> {f.clinicalNote}
                  </div>
                )}
                {(f.treatments||[]).length > 0 && (
                  <div style={{ marginTop:8 }}>
                    <div style={{ fontFamily:FS, fontSize:10, color:MU, letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:6 }}>Recommended Treatments</div>
                    <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                      {f.treatments.map((t, ti) => (
                        <span key={ti} style={{ fontFamily:FS, fontSize:12, color:G, background:'rgba(44,74,114,.06)',
                          border:'1px solid rgba(44,74,114,.2)', padding:'4px 10px', borderRadius:8 }}>
                          {t.procedure}{t.price ? ` · ${t.price}` : ''}
                        </span>
                      ))}
                    </div>
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
