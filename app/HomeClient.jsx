'use client'

import { useEffect, useState } from 'react'
import { createClient } from '../lib/supabase'
import GlowIQApp from '../components/GlowIQApp'

export default function HomeClient() {
  const [user, setUser]       = useState(undefined)
  const [email, setEmail]     = useState('')
  const [sent, setSent]       = useState(false)
  const [error, setError]     = useState(null)
  const [supabase]            = useState(() => createClient())

  useEffect(() => {
    if (!supabase) { setUser(null); return; }
    supabase.auth.getUser().then(({ data: { user } }) => setUser(user ?? null))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [supabase])

  const sendMagicLink = async (e) => {
    e.preventDefault()
    setError(null)
    if (!supabase) { setError('Auth not available'); return; }
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) setError(error.message)
    else setSent(true)
  }

  if (user === undefined) {
    return (
      <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#E8EDF5' }}>
        <div style={{ width:24, height:24, borderRadius:'50%', border:'2px solid #2C4A72', borderTopColor:'transparent', animation:'spin .7s linear infinite' }}/>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    )
  }

  if (!user) {
    return (
      <div style={{ minHeight:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:'#E8EDF5', padding:24, gap:24 }}>
        <div style={{ textAlign:'center' }}>
          <svg width="52" height="52" viewBox="0 0 60 60" style={{ marginBottom:16 }}>
            <circle cx="30" cy="30" r="22" fill="none" stroke="#2C4A72" strokeWidth="0.75" opacity="0.38"/>
            <circle cx="30" cy="30" r="14" fill="none" stroke="#2C4A72" strokeWidth="1.75"/>
            <circle cx="30" cy="30" r="7"  fill="none" stroke="#2C4A72" strokeWidth="1.25"/>
            <circle cx="30" cy="30" r="2.5" fill="#2C4A72"/>
            <line x1="30" y1="6"  x2="30" y2="0"  stroke="#2C4A72" strokeWidth="1.25" strokeLinecap="round"/>
            <line x1="54" y1="30" x2="60" y2="30" stroke="#2C4A72" strokeWidth="1.25" strokeLinecap="round"/>
            <line x1="30" y1="54" x2="30" y2="60" stroke="#2C4A72" strokeWidth="1.25" strokeLinecap="round"/>
            <line x1="6"  y1="30" x2="0"  y2="30" stroke="#2C4A72" strokeWidth="1.25" strokeLinecap="round"/>
          </svg>
          <div style={{ fontFamily:"Georgia,serif", fontSize:28, fontStyle:'italic', color:'#141C2B', letterSpacing:'0.14em', marginBottom:6 }}>GlowIQ</div>
          <div style={{ fontFamily:"Georgia,serif", fontSize:10, letterSpacing:'0.2em', color:'#8898B4', textTransform:'uppercase' }}>Skin Roadmap</div>
        </div>

        {!sent ? (
          <form onSubmit={sendMagicLink} style={{ display:'flex', flexDirection:'column', gap:12, width:'100%', maxWidth:320 }}>
            <input
              type="email" required placeholder="your@email.com" value={email}
              onChange={e => setEmail(e.target.value)}
              style={{ padding:'12px 14px', borderRadius:10, border:'1px solid #C2CCE0', background:'white', fontFamily:"Georgia,serif", fontSize:15, color:'#141C2B', outline:'none', width:'100%' }}
            />
            <button type="submit"
              style={{ padding:'13px', borderRadius:10, border:'none', background:'linear-gradient(130deg,#1E3560,#2C4A72,#3A5F8A)', fontFamily:"Georgia,serif", fontSize:13, color:'#F7F4F0', cursor:'pointer', letterSpacing:'0.1em' }}>
              Send sign-in link
            </button>
            {error && <div style={{ fontFamily:"Georgia,serif", fontSize:12, color:'#B91C1C', textAlign:'center' }}>{error}</div>}
            <div style={{ fontFamily:"Georgia,serif", fontSize:11, color:'#8898B4', textAlign:'center', lineHeight:1.5 }}>
              We'll email you a secure link — no password needed.
            </div>
          </form>
        ) : (
          <div style={{ textAlign:'center', fontFamily:"Georgia,serif", maxWidth:280 }}>
            <div style={{ fontSize:32, marginBottom:12 }}>✉</div>
            <div style={{ fontSize:15, color:'#141C2B', marginBottom:8 }}>Check your email</div>
            <div style={{ fontSize:13, color:'#8898B4', lineHeight:1.6 }}>
              We sent a sign-in link to <strong>{email}</strong>. Tap it on this device to open GlowIQ.
            </div>
          </div>
        )}
      </div>
    )
  }

  return <GlowIQApp />
}
