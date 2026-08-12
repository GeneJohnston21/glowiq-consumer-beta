import { supabaseAdmin } from '@/lib/supabase-admin'
import { notFound } from 'next/navigation'
import AnalysisPanel from './AnalysisPanel'
import HairPanel from './HairPanel'
import SkinPanel from './SkinPanel'

export const dynamic = 'force-dynamic'

const FF = "Georgia,'Times New Roman',serif", FS = "system-ui,sans-serif"
const G = '#2C4A72', TX = '#141C2B', MU = '#4A5B76', BR = '#C2CCE0'

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric' }) : '—'

export default async function UserDetailPage({ params }) {
  const { id } = await params

  const [{ data: { user }, error }, { data: storage }] = await Promise.all([
    supabaseAdmin.auth.admin.getUserById(id),
    supabaseAdmin.from('user_storage').select('key, value').eq('user_id', id)
      .in('key', ['glow:profile','glow:index','glow:hair','glow:derm','glow:hairProfile']),
  ])

  if (error || !user) notFound()

  const byKey = {}
  storage?.forEach(r => { byKey[r.key] = r.value })

  let profile = {}, analyses = [], hairScans = [], skinChecks = [], hairProfile = null
  try { profile     = JSON.parse(byKey['glow:profile']     || '{}') } catch {}
  try { analyses    = JSON.parse(byKey['glow:index']       || '[]') } catch {}
  try { hairScans   = JSON.parse(byKey['glow:hair']        || '[]') } catch {}
  try { skinChecks  = JSON.parse(byKey['glow:derm']        || '[]') } catch {}
  try { hairProfile = JSON.parse(byKey['glow:hairProfile'] || 'null') } catch {}
  analyses.sort((a,b) => new Date(b.date) - new Date(a.date))
  hairScans.sort((a,b) => new Date(b.date) - new Date(a.date))
  skinChecks.sort((a,b) => new Date(b.date) - new Date(a.date))

  // Signed URLs for all photos across all modes (1 hour expiry)
  const photoUrls = {}
  const allEntries = [...analyses, ...hairScans, ...skinChecks]
  await Promise.allSettled(
    allEntries
      .filter(e => e.photo_path)
      .map(async e => {
        const { data } = await supabaseAdmin.storage
          .from('analysis-photos')
          .createSignedUrl(e.photo_path, 3600)
        if (data?.signedUrl) photoUrls[e.id] = data.signedUrl
      })
  )

  const SEV_ORDER = { Significant:3, Moderate:2, Mild:1 }
  const SEV_COLOR = {
    Significant: { tx:'#B91C1C', bg:'rgba(185,28,28,.1)',  br:'rgba(185,28,28,.3)'  },
    Moderate:    { tx:'#C2410C', bg:'rgba(194,65,12,.1)',  br:'rgba(194,65,12,.3)'  },
    Mild:        { tx:'#A16207', bg:'rgba(161,98,7,.12)',  br:'rgba(161,98,7,.3)'   },
  }

  const hasGlp1 = (Array.isArray(profile.medications) && profile.medications.some(m => typeof m === 'string' && m.includes('GLP-1')))
    || (typeof profile.medications === 'string' && profile.medications.includes('GLP-1'))

  const profileItems = [
    { label:'Age',          value: profile.age },
    { label:'Fitzpatrick',  value: profile.fitzpatrickType },
    { label:'Skin Goals',   value: (profile.goals||[]).join(', ') },
    { label:'Hair Goals',   value: (profile.hairGoals||[]).join(', ') },
    { label:'Conditions',   value: (profile.conditions||[]).join(', ') },
    { label:'Medications',  value: Array.isArray(profile.medications) ? profile.medications.filter(m=>m!=='None').join(', ') : profile.medications },
    { label:'Allergies',    value: profile.allergies },
    { label:'SPF',          value: profile.spf || profile.spfHabit },
    { label:'Sun Exposure', value: profile.sunExposure },
  ].filter(i => i.value && i.value.length > 0)

  const hairProfileItems = hairProfile ? [
    { label:'Sex',              value: hairProfile.sex },
    { label:'Family History',   value: hairProfile.familyHistory === 'both' ? 'Both parents' : hairProfile.familyHistory === 'one' ? 'One parent' : hairProfile.familyHistory },
    { label:'Thinning Duration',value: hairProfile.duration === 'recent' ? 'Just started' : hairProfile.duration },
    { label:'Prev. Treatments', value: (hairProfile.prevTreatments||[]).join(', ') },
  ].filter(i => i.value && i.value.length > 0) : []

  const sectionHeader = (title, count, unit) => (
    <div style={{ marginBottom:12, marginTop:28 }}>
      <h2 style={{ fontFamily:FF, fontSize:22, fontWeight:300, color:TX, margin:0, fontStyle:'italic' }}>
        {title}
        <span style={{ fontFamily:FS, fontSize:13, fontWeight:400, color:MU, marginLeft:10 }}>
          {count} {unit}{count !== 1 ? 's' : ''}
        </span>
      </h2>
    </div>
  )

  const emptyCard = (msg) => (
    <div style={{ background:'white', border:`1px solid ${BR}`, borderRadius:12, padding:'28px',
      textAlign:'center', fontFamily:FS, fontSize:13, color:MU }}>
      {msg}
    </div>
  )

  return (
    <div>
      <div style={{ marginBottom:20 }}>
        <a href="/users" style={{ fontFamily:FS, fontSize:12, color:MU }}>← Users</a>
      </div>

      {/* User header */}
      <div style={{ background:'white', border:`1px solid ${BR}`, borderRadius:12,
        padding:'24px 28px', marginBottom:24 }}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:20 }}>
          <div>
            <h1 style={{ fontFamily:FF, fontSize:28, fontWeight:300, color:TX, margin:'0 0 4px', fontStyle:'italic' }}>
              {profile.name || <span style={{ color:MU }}>Unnamed User</span>}
            </h1>
            <div style={{ fontFamily:FS, fontSize:14, color:MU }}>{user.email}</div>
            {hasGlp1 && (
              <div style={{ display:'inline-flex', alignItems:'center', gap:6, marginTop:10,
                padding:'4px 12px', borderRadius:12, background:'rgba(124,45,18,.08)',
                border:'1px solid rgba(124,45,18,.3)' }}>
                <span style={{ fontFamily:FS, fontSize:11, fontWeight:600, color:'#7C2D12' }}>GLP-1 Patient — prevention-first hair protocol</span>
              </div>
            )}
          </div>
          <div style={{ textAlign:'right', flexShrink:0 }}>
            <div style={{ fontFamily:FS, fontSize:11, color:MU, marginBottom:2 }}>Member since</div>
            <div style={{ fontFamily:FS, fontSize:13, color:TX }}>{fmtDate(user.created_at)}</div>
            <div style={{ fontFamily:FS, fontSize:11, color:MU, marginTop:8, marginBottom:2 }}>Last active</div>
            <div style={{ fontFamily:FS, fontSize:13, color:TX }}>{fmtDate(user.last_sign_in_at)}</div>
          </div>
        </div>

        {profileItems.length > 0 && (
          <div style={{ marginTop:20, paddingTop:20, borderTop:`1px solid ${BR}`,
            display:'flex', flexWrap:'wrap', gap:'12px 32px' }}>
            {profileItems.map(({ label, value }) => (
              <div key={label}>
                <div style={{ fontFamily:FS, fontSize:10, color:MU, letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:2 }}>{label}</div>
                <div style={{ fontFamily:FS, fontSize:13, color:TX }}>{value}</div>
              </div>
            ))}
          </div>
        )}

        {hairProfileItems.length > 0 && (
          <div style={{ marginTop:16, paddingTop:16, borderTop:`1px solid ${BR}` }}>
            <div style={{ fontFamily:FS, fontSize:10, color:G, letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:10, fontWeight:600 }}>Hair Restoration Intake</div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:'12px 32px' }}>
              {hairProfileItems.map(({ label, value }) => (
                <div key={label}>
                  <div style={{ fontFamily:FS, fontSize:10, color:MU, letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:2 }}>{label}</div>
                  <div style={{ fontFamily:FS, fontSize:13, color:TX, textTransform:'capitalize' }}>{value}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Face analyses */}
      {sectionHeader('Face Analysis History', analyses.length, 'scan')}
      {analyses.length === 0 ? emptyCard('No face analyses yet') : (
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          {analyses.map((entry, idx) => (
            <AnalysisPanel
              key={entry.id || idx}
              entry={entry}
              photoUrl={photoUrls[entry.id] || null}
              SEV_COLOR={SEV_COLOR}
              SEV_ORDER={SEV_ORDER}
            />
          ))}
        </div>
      )}

      {/* Hair analyses */}
      {sectionHeader('Hair & Scalp History', hairScans.length, 'scan')}
      {hairScans.length === 0 ? emptyCard('No hair analyses yet') : (
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          {hairScans.map((entry, idx) => (
            <HairPanel
              key={entry.id || idx}
              entry={entry}
              photoUrl={photoUrls[entry.id] || null}
            />
          ))}
        </div>
      )}

      {/* Skin checks */}
      {sectionHeader('Skin Check History', skinChecks.length, 'check')}
      {skinChecks.length === 0 ? emptyCard('No skin checks yet') : (
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          {skinChecks.map((entry, idx) => (
            <SkinPanel
              key={entry.id || idx}
              entry={entry}
              photoUrl={photoUrls[entry.id] || null}
            />
          ))}
        </div>
      )}
    </div>
  )
}
