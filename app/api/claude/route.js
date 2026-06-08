import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export const maxDuration = 60

export async function POST(request) {
  try {
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
   

    if (!user) {
      return NextResponse.json(
        { error: { type: 'auth_error', message: 'Not authenticated' } },
        { status: 401 }
      )
    }

    const body = await request.json()

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
      },
      body: JSON.stringify(body),
    })

    const text = await response.text()


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