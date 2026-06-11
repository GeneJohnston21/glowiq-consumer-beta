import { supabaseAdmin } from '@/lib/supabase-admin'
import { notFound } from 'next/navigation'
import AnalysisPanel from './AnalysisPanel'

export const dynamic = 'force-dynamic'

const FF = "Georgia,'Times New Roman',serif", FS = "system-ui,sans-serif"
const G = '#2C4A72', TX = '#141C2B', MU = '#4A5B76', BR = '#C2CCE0'

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric' }) : '—'

export default async function UserDetailPage({ params }) {
  const { id } = await params

  const [{ data: { user }, error }, { data: storage }] = await Promise.all([
    supabaseAdmin.auth.admin.getUserById(id),
    supabaseAdmin.from('user_storage').select('key, value').eq('user_id', id)
      .in('key', ['glow:profile','glow:index']),
  ])

  if (error || !user) notFound()

  const byKey = {}
  storage?.forEach(r => { byKey[r.key] = r.value })

  let profile = {}, analyses = []
  try { profile  = JSON.parse(byKey['glow:profile'] || '{}') } catch {}
  try { analyses = JSON.parse(byKey['glow:index']   || '[]') } catch {}
  analyses.sort((a,b) => new Date(b.date) - new Date(a.date))

  // Generate signed URLs for all photos (1 hour expiry)
  const photoUrls = {}
  await Promise.allSettled(
    analyses
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

  const profileItems = [
    { label:'Age',          value: profile.age },
    { label:'Fitzpatrick',  value: profile.fitzpatrickType },
    { label:'Goals',        value: (profile.goals||[]).join(', ') },
    { label:'Conditions',   value: (profile.conditions||[]).join(', ') },
    { label:'Medications',  value: profile.medications },
    { label:'Allergies',    value: profile.allergies },
    { label:'SPF',          value: profile.spf },
    { label:'Sun Exposure', value: profile.sunExposure },
  ].filter(i => i.value && i.value.length > 0)

  return (
    <div>
      <div style={{ marginBottom:20 }}>
        <a href="/users" style={{ fontFamily:FS, fontSize:12, color:MU }}>← Users</a>
      </div>

      <div style={{ background:'white', border:`1px solid ${BR}`, borderRadius:12,
        padding:'24px 28px', marginBottom:24 }}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:20 }}>
          <div>
            <h1 style={{ fontFamily:FF, fontSize:28, fontWeight:300, color:TX, margin:'0 0 4px', fontStyle:'italic' }}>
              {profile.name || <span style={{ color:MU }}>Unnamed User</span>}
            </h1>
            <div style={{ fontFamily:FS, fontSize:14, color:MU }}>{user.email}</div>
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
      </div>

      <div style={{ marginBottom:12 }}>
        <h2 style={{ fontFamily:FF, fontSize:22, fontWeight:300, color:TX, margin:0, fontStyle:'italic' }}>
          Analysis History
          <span style={{ fontFamily:FS, fontSize:13, fontWeight:400, color:MU, marginLeft:10 }}>
            {analyses.length} scan{analyses.length !== 1 ? 's' : ''}
          </span>
        </h2>
      </div>

      {analyses.length === 0 && (
        <div style={{ background:'white', border:`1px solid ${BR}`, borderRadius:12, padding:'40px',
          textAlign:'center', fontFamily:FS, fontSize:14, color:MU }}>
          No analyses yet
        </div>
      )}

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
    </div>
  )
}
