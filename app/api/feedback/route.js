import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function POST(request) {
  try {
    const { type, message, context, screenshot } = await request.json()
    if (!message?.trim()) {
      return Response.json({ error: 'Message required' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    )

    const { error } = await supabase.from('feedback').insert({
      type:       type || 'General',
      message:    message.trim(),
      context:    context || null,
      screenshot: screenshot || null,
    })

    if (error) {
      console.error('Supabase insert error:', error)
      return Response.json({ error: error.message }, { status: 500 })
    }

    return Response.json({ ok: true })
  } catch (err) {
    console.error('Feedback route error:', err)
    return Response.json({ error: err.message }, { status: 500 })
  }
}
