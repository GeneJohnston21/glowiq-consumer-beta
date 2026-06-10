export const dynamic = 'force-dynamic'

const FF = "Georgia,'Times New Roman',serif", FS = "system-ui,sans-serif"
const TX = '#141C2B', MU = '#4A5B76', BR = '#C2CCE0', G = '#2C4A72'

export default function ProvidersPage() {
  return (
    <div>
      <div style={{ marginBottom:28 }}>
        <h1 style={{ fontFamily:FF, fontSize:32, fontWeight:300, color:TX, margin:0, fontStyle:'italic' }}>Providers</h1>
        <p style={{ fontFamily:FS, fontSize:13, color:MU, margin:'6px 0 0' }}>Practice accounts and patient management</p>
      </div>
      <div style={{ background:'white', border:`1px solid ${BR}`, borderRadius:12, padding:'48px',
        textAlign:'center' }}>
        <div style={{ fontFamily:FF, fontSize:48, fontWeight:300, color:'rgba(44,74,114,.2)', marginBottom:16 }}>✦</div>
        <div style={{ fontFamily:FF, fontSize:22, fontStyle:'italic', color:TX, marginBottom:8 }}>Provider Management</div>
        <div style={{ fontFamily:FS, fontSize:14, color:MU, lineHeight:1.6, maxWidth:420, margin:'0 auto' }}>
          This section will allow you to onboard practices, manage their patient rosters,
          configure subdomain portals, and generate per-practice billing reports.
          Coming when the provider version launches.
        </div>
      </div>
    </div>
  )
}
