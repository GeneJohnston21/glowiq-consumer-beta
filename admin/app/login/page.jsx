'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'

const G='#2C4A72', TX='#141C2B', MU='#4A5B76', BR='#C2CCE0', FF="Georgia,'Times New Roman',serif", FS="system-ui,sans-serif"

export default function LoginPage() {
  const [email,  setEmail]  = useState('')
  const [sent,   setSent]   = useState(false)
  const [error,  setError]  = useState(null)
  const [loading,setLoading]= useState(false)
  const [supabase]          = useState(() => createClient())

  const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
  const unauthorized = searchParams?.get('error') === 'unauthorized'

  const send = async (e) => {
    e.preventDefault()
    setError(null); setLoading(true)
    if (!supabase) { setError('Auth unavailable'); setLoading(false); return }
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/api/auth/callback` },
    })
    if (error) setError(error.message)
    else setSent(true)
    setLoading(false)
  }

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center',
      background:'#1A2B4A', padding:24 }}>
      <div style={{ width:'100%', maxWidth:380 }}>

        {/* Logo */}
        <div style={{ textAlign:'center', marginBottom:48 }}>
          <svg width="48" height="48" viewBox="0 0 60 60" style={{ marginBottom:16 }}>
            <circle cx="30" cy="30" r="22" fill="none" stroke="rgba(255,255,255,.25)" strokeWidth="1"/>
            <circle cx="30" cy="30" r="14" fill="none" stroke="rgba(255,255,255,.9)" strokeWidth="2"/>
            <circle cx="30" cy="30" r="7"  fill="none" stroke="rgba(255,255,255,.55)" strokeWidth="1.5"/>
            <circle cx="30" cy="30" r="2.5" fill="white"/>
            <line x1="30" y1="6"  x2="30" y2="0"  stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
            <line x1="54" y1="30" x2="60" y2="30" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
            <line x1="30" y1="54" x2="30" y2="60" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
            <line x1="6"  y1="30" x2="0"  y2="30" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <div style={{ fontFamily:FF, fontSize:28, fontStyle:'italic', color:'white', letterSpacing:'0.12em' }}>GlowIQ</div>
          <div style={{ fontFamily:FS, fontSize:10, color:'rgba(255,255,255,.5)', letterSpacing:'0.2em', marginTop:4, textTransform:'uppercase' }}>Admin Portal</div>
        </div>

        {unauthorized && (
          <div style={{ padding:'12px 16px', borderRadius:8, background:'rgba(185,28,28,.15)',
            border:'1px solid rgba(185,28,28,.4)', marginBottom:20, fontFamily:FS, fontSize:13,
            color:'#FCA5A5', textAlign:'center' }}>
            This email is not authorised for admin access.
          </div>
        )}

        {!sent ? (
          <form onSubmit={send} style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <input type="email" required placeholder="Admin email address" value={email}
              onChange={e => setEmail(e.target.value)}
              style={{ padding:'13px 16px', borderRadius:10, border:'1px solid rgba(255,255,255,.15)',
                background:'rgba(255,255,255,.07)', fontFamily:FF, fontSize:15,
                color:'white', outline:'none', width:'100%' }} />
            <button type="submit" disabled={loading}
              style={{ padding:'13px', borderRadius:10, border:'none',
                background: loading ? 'rgba(255,255,255,.1)' : 'rgba(255,255,255,.15)',
                fontFamily:FS, fontSize:13, color:'rgba(255,255,255,.85)',
                cursor: loading ? 'wait' : 'pointer', letterSpacing:'0.1em', textTransform:'uppercase' }}>
              {loading ? 'Sending…' : 'Send sign-in link'}
            </button>
            {error && <div style={{ fontFamily:FS, fontSize:12, color:'#FCA5A5', textAlign:'center' }}>{error}</div>}
          </form>
        ) : (
          <div style={{ textAlign:'center' }}>
            <div style={{ fontSize:40, marginBottom:16 }}>✉</div>
            <div style={{ fontFamily:FF, fontSize:17, color:'white', marginBottom:8 }}>Check your email</div>
            <div style={{ fontFamily:FS, fontSize:13, color:'rgba(255,255,255,.55)', lineHeight:1.6 }}>
              Sign-in link sent to <strong style={{ color:'rgba(255,255,255,.8)' }}>{email}</strong>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
