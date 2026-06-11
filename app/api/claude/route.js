import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export const maxDuration = 60

export async function POST(request) {
  try {
    // Next.js 16 requires awaiting cookies()
    const cookieStore = await cookies()

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          get: (name) => cookieStore.get(name)?.value,
          set: () => {},
          remove: () => {},
        },
      }
    )

    const { data: { user } } = await supabase.auth.getUser()
    console.log('[claude proxy] user:', user?.id ?? 'NOT AUTHENTICATED')

    if (!user) {
      return NextResponse.json(
        { error: { type: 'auth_error', message: 'Not authenticated' } },
        { status: 401 }
      )
    }

    const body = await request.json()
    console.log('[claude proxy] request size:', JSON.stringify(body).length, 'chars')
    console.log('[claude proxy] API key present:', !!process.env.ANTHROPIC_API_KEY)

    console.log('[claude proxy] API key present:', !!process.env.ANTHROPIC_API_KEY, 'length:', (process.env.ANTHROPIC_API_KEY||'').length)
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
      },
      body: JSON.stringify(body),
    })

    // Read as text first so we can log failures
    const text = await response.text()
    console.log('[claude proxy] Anthropic status:', response.status, '| body length:', text.length)

    let data
    try {
      data = JSON.parse(text)
    } catch (e) {
      console.error('[claude proxy] Anthropic returned non-JSON:', text.slice(0, 300))
      return NextResponse.json(
        { error: { type: 'parse_error', message: 'Invalid response from AI service' } },
        { status: 502 }
      )
    }

    return NextResponse.json(data, { status: response.status })
  } catch (error) {
    console.error('[claude proxy] error:', error)
    return NextResponse.json(
      { error: { type: 'proxy_error', message: error.message } },
      { status: 500 }
    )
  }
}
