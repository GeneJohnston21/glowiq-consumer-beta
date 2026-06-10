import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function POST(request) {
  try {
    const { type, message, context, screenshot } = await request.json()
    if (!message?.trim()) return Response.json({ error: 'Message required' }, { status: 400 })

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

    const { error } = await supabase.from('feedback').insert({
      user_id:    user?.id ?? null,
      type:       type || 'General',
      message:    message.trim(),
      context:    context || null,
      screenshot: screenshot || null,
    })

    if (error) throw error
    return Response.json({ ok: true })
  } catch (err) {
    console.error('Feedback error:', err)
    return Response.json({ error: 'Failed to save feedback' }, { status: 500 })
  }
}
