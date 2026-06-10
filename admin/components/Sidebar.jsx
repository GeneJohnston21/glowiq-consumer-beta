'use client'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

const FF = "Georgia,'Times New Roman',serif"
const FS = "system-ui,sans-serif"

const NAV = [
  { href:'/',           icon:'◎', label:'Dashboard'  },
  { href:'/users',      icon:'◈', label:'Users'       },
  { href:'/providers',  icon:'✦', label:'Providers'   },
  { href:'/feedback',   icon:'◇', label:'Feedback'    },
  { href:'/billing',    icon:'≋', label:'Billing'     },
]

export default function Sidebar({ feedbackCount = 0 }) {
  const pathname = usePathname()
  const router   = useRouter()

  const signOut = async () => {
    const supabase = createClient()
    if (supabase) await supabase.auth.signOut()
    router.push('/login')
  }

  const isActive = (href) => href === '/' ? pathname === '/' : pathname.startsWith(href)

  return (
    <div style={{ width:220, minHeight:'100vh', background:'#1A2B4A', display:'flex',
      flexDirection:'column', flexShrink:0, position:'sticky', top:0, height:'100vh' }}>

      {/* Logo */}
      <div style={{ padding:'28px 24px 24px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <svg width="28" height="28" viewBox="0 0 60 60">
            <circle cx="30" cy="30" r="22" fill="none" stroke="rgba(255,255,255,.25)" strokeWidth="1"/>
            <circle cx="30" cy="30" r="14" fill="none" stroke="rgba(255,255,255,.88)" strokeWidth="2"/>
            <circle cx="30" cy="30" r="7"  fill="none" stroke="rgba(255,255,255,.5)"  strokeWidth="1.5"/>
            <circle cx="30" cy="30" r="2.5" fill="white"/>
            <line x1="30" y1="6"  x2="30" y2="0"  stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
            <line x1="54" y1="30" x2="60" y2="30" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
            <line x1="30" y1="54" x2="30" y2="60" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
            <line x1="6"  y1="30" x2="0"  y2="30" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <div>
            <div style={{ fontFamily:FF, fontSize:18, fontStyle:'italic', color:'white', letterSpacing:'0.1em', lineHeight:1 }}>GlowIQ</div>
            <div style={{ fontFamily:FS, fontSize:8, color:'rgba(255,255,255,.45)', letterSpacing:'0.18em', textTransform:'uppercase', marginTop:3 }}>Admin Portal</div>
          </div>
        </div>
      </div>

      <div style={{ height:'1px', background:'rgba(255,255,255,.08)', margin:'0 16px' }} />

      {/* Nav */}
      <nav style={{ flex:1, padding:'16px 12px', display:'flex', flexDirection:'column', gap:4 }}>
        {NAV.map(({ href, icon, label }) => {
          const active = isActive(href)
          return (
            <a key={href} href={href}
              style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', borderRadius:8,
                background: active ? 'rgba(255,255,255,.12)' : 'transparent',
                color: active ? 'white' : 'rgba(255,255,255,.55)',
                transition:'all .15s', cursor:'pointer', position:'relative' }}>
              <span style={{ fontSize:14 }}>{icon}</span>
              <span style={{ fontFamily:FS, fontSize:13, fontWeight: active ? 500 : 400 }}>{label}</span>
              {label === 'Feedback' && feedbackCount > 0 && (
                <span style={{ marginLeft:'auto', minWidth:18, height:18, borderRadius:9,
                  background:'#EF4444', display:'flex', alignItems:'center', justifyContent:'center',
                  fontFamily:FS, fontSize:10, fontWeight:600, color:'white', padding:'0 5px' }}>
                  {feedbackCount}
                </span>
              )}
              {label === 'Providers' && (
                <span style={{ marginLeft:'auto', fontFamily:FS, fontSize:9, color:'rgba(255,255,255,.3)',
                  letterSpacing:'0.08em', textTransform:'uppercase' }}>soon</span>
              )}
            </a>
          )
        })}
      </nav>

      <div style={{ height:'1px', background:'rgba(255,255,255,.08)', margin:'0 16px' }} />

      {/* Sign out */}
      <div style={{ padding:'16px 12px' }}>
        <button onClick={signOut}
          style={{ width:'100%', padding:'9px 12px', borderRadius:8, background:'transparent',
            border:'1px solid rgba(255,255,255,.15)', fontFamily:FS, fontSize:12,
            color:'rgba(255,255,255,.5)', cursor:'pointer', textAlign:'left',
            display:'flex', alignItems:'center', gap:8 }}>
          <span>↩</span> Sign out
        </button>
      </div>
    </div>
  )
}
