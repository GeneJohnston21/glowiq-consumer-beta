'use client'
import { useState } from 'react'

const FF = "Georgia,'Times New Roman',serif", FS = "system-ui,sans-serif"
const TX = '#141C2B', MU = '#4A5B76', BR = '#C2CCE0', G = '#2C4A72'

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', {
  month:'long', day:'numeric', year:'numeric', hour:'2-digit', minute:'2-digit'
}) : '—'

const calcScore = (concerns = []) => {
  const ded = concerns.reduce((t,c) => t+(c.severity==='Significant'?18:c.severity==='Moderate'?10:4), 0)
  return Math.max(10, 100-ded)
}

export default function AnalysisPanel({ entry, photoUrl, SEV_COLOR, SEV_ORDER }) {
  const [open,    setOpen]    = useState(false)
  const [lightbox,setLightbox]= useState(false)

  const score      = calcScore(entry.concerns)
  const scoreColor = score>=80?'#14532D':score>=60?'#7C2D12':'#B91C1C'
  const sorted     = [...(entry.concerns||[])].sort((a,b)=>(SEV_ORDER[b.severity]||0)-(SEV_ORDER[a.severity]||0))
  const displaySrc = photoUrl || entry.thumb

  return (
    <>
      <div style={{ background:'white', border:`1px solid ${BR}`, borderRadius:12, overflow:'hidden' }}>

        {/* Header row */}
        <div onClick={() => setOpen(o=>!o)}
          style={{ padding:'16px 24px', cursor:'pointer', display:'flex', alignItems:'center', gap:16 }}
          onMouseEnter={e=>e.currentTarget.style.background='#F8F9FC'}
          onMouseLeave={e=>e.currentTarget.style.background='white'}>

          {entry.thumb && (
            <img src={entry.thumb} alt="scan"
              style={{ width:52, height:52, borderRadius:8, objectFit:'cover', flexShrink:0, border:`1px solid ${BR}` }} />
          )}

          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:4 }}>
              <span style={{ fontFamily:FS, fontSize:13, fontWeight:500, color:TX }}>{entry.skinType||'Unknown'}</span>
              <span style={{ fontFamily:FS, fontSize:11, color:MU }}>{entry.fitzpatrickType}</span>
              {photoUrl
                ? <span style={{ fontFamily:FS, fontSize:10, color:'#14532D', background:'rgba(21,128,61,.1)', border:'1px solid rgba(21,128,61,.3)', padding:'1px 7px', borderRadius:4 }}>Full res</span>
                : <span style={{ fontFamily:FS, fontSize:10, color:MU, background:'rgba(44,74,114,.07)', border:`1px solid ${BR}`, padding:'1px 7px', borderRadius:4 }}>Thumbnail</span>
              }
            </div>
            <div style={{ fontFamily:FS, fontSize:12, color:MU }}>{fmtDate(entry.date)}</div>
          </div>

          <div style={{ display:'flex', alignItems:'center', gap:16, flexShrink:0 }}>
            <div style={{ textAlign:'center' }}>
              <div style={{ fontFamily:FF, fontSize:26, color:scoreColor, lineHeight:1 }}>{score}</div>
              <div style={{ fontFamily:FS, fontSize:9, color:MU, letterSpacing:'0.08em', textTransform:'uppercase' }}>Score</div>
            </div>
            <div style={{ display:'flex', gap:6 }}>
              {['Significant','Moderate','Mild'].map(s => {
                const n = (entry.concerns||[]).filter(c=>c.severity===s).length
                if (!n) return null
                const sv = SEV_COLOR[s]
                return <span key={s} style={{ fontFamily:FS, fontSize:11, padding:'2px 8px',
                  background:sv.bg, border:`1px solid ${sv.br}`, borderRadius:4, color:sv.tx }}>
                  {n} {s}
                </span>
              })}
            </div>
            <span style={{ fontFamily:FS, fontSize:16, color:MU, userSelect:'none' }}>{open?'▲':'▼'}</span>
          </div>
        </div>

        {/* Expanded */}
        {open && (
          <div style={{ borderTop:`1px solid ${BR}` }}>
            <div style={{ display:'grid', gridTemplateColumns:'320px 1fr' }}>

              {/* Left: photo + assessment */}
              <div style={{ padding:'20px 24px', borderRight:`1px solid ${BR}` }}>
                {displaySrc && (
                  <div style={{ position:'relative', marginBottom:16 }}>
                    <img src={displaySrc} alt="Full scan"
                      onClick={() => setLightbox(true)}
                      style={{ width:'100%', borderRadius:10, border:`1px solid ${BR}`,
                        display:'block', cursor:'zoom-in' }} />
                    <div style={{ position:'absolute', bottom:8, right:8, fontFamily:FS, fontSize:10,
                      background:'rgba(0,0,0,.55)', color:'white', padding:'3px 8px', borderRadius:4 }}>
                      {photoUrl ? '🔍 Full resolution' : 'Thumbnail only'}
                    </div>
                  </div>
                )}
                {entry.overallAssessment && (
                  <>
                    <div style={{ fontFamily:FS, fontSize:10, letterSpacing:'0.12em', color:MU,
                      textTransform:'uppercase', marginBottom:6 }}>Overall Assessment</div>
                    <p style={{ fontFamily:FS, fontSize:13, color:TX, lineHeight:1.65, margin:0 }}>
                      {entry.overallAssessment}
                    </p>
                  </>
                )}
              </div>

              {/* Right: concerns + treatments */}
              <div style={{ padding:'20px 24px' }}>
                <div style={{ marginBottom:20 }}>
                  <div style={{ fontFamily:FS, fontSize:10, letterSpacing:'0.12em', color:MU,
                    textTransform:'uppercase', marginBottom:12 }}>Identified Concerns</div>
                  {sorted.length === 0 && (
                    <div style={{ fontFamily:FS, fontSize:13, color:MU, fontStyle:'italic' }}>No concerns identified</div>
                  )}
                  <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                    {sorted.map((c,i) => {
                      const sv = SEV_COLOR[c.severity]||SEV_COLOR.Mild
                      return (
                        <div key={i} style={{ padding:'12px 14px', borderRadius:8, background:sv.bg, border:`1px solid ${sv.br}` }}>
                          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:c.description?6:0 }}>
                            <span style={{ fontFamily:FS, fontSize:13, fontWeight:600, color:sv.tx }}>{c.name}</span>
                            <span style={{ fontFamily:FS, fontSize:10, padding:'1px 7px', borderRadius:4,
                              background:'rgba(255,255,255,.6)', border:`1px solid ${sv.br}`, color:sv.tx }}>{c.severity}</span>
                            {c.analysisConfidence && (
                              <span style={{ fontFamily:FS, fontSize:10, color:sv.tx, opacity:.7, marginLeft:'auto' }}>
                                {c.analysisConfidence}% confidence
                              </span>
                            )}
                          </div>
                          {c.description && (
                            <div style={{ fontFamily:FS, fontSize:12, color:TX, lineHeight:1.5 }}>{c.description}</div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>

                {(entry.recommendations||[]).length > 0 && (
                  <div>
                    <div style={{ fontFamily:FS, fontSize:10, letterSpacing:'0.12em', color:MU,
                      textTransform:'uppercase', marginBottom:12 }}>Recommended Treatments</div>
                    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                      {entry.recommendations.map((r,i) => (
                        <div key={i} style={{ padding:'10px 14px', borderRadius:8,
                          background:'rgba(44,74,114,.05)', border:`1px solid rgba(44,74,114,.15)` }}>
                          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
                            <span style={{ fontFamily:FS, fontSize:13, fontWeight:500, color:TX }}>{r.procedure}</span>
                            {(r.price||r.priceRange) && (
                              <span style={{ fontFamily:FF, fontSize:13, fontStyle:'italic', color:G, flexShrink:0 }}>
                                {r.price||r.priceRange}
                              </span>
                            )}
                          </div>
                          {r.category && <div style={{ fontFamily:FS, fontSize:11, color:MU, marginTop:2 }}>{r.category}</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div onClick={()=>setLightbox(false)}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.88)', display:'flex',
            alignItems:'center', justifyContent:'center', zIndex:1000, padding:24, cursor:'zoom-out' }}>
          <img src={displaySrc} alt="Full scan"
            style={{ maxWidth:'92vw', maxHeight:'92vh', borderRadius:10,
              boxShadow:'0 24px 60px rgba(0,0,0,.6)', objectFit:'contain' }} />
        </div>
      )}
    </>
  )
}
