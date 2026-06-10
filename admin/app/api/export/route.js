import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const year  = parseInt(searchParams.get('year')  || new Date().getFullYear())
  const month = parseInt(searchParams.get('month') || new Date().getMonth() + 1)

  const start = new Date(year, month - 1, 1).toISOString()
  const end   = new Date(year, month, 1).toISOString()

  const { data: { users } } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 })

  const active = users.filter(u =>
    u.last_sign_in_at && u.last_sign_in_at >= start && u.last_sign_in_at < end
  )

  const rows = [
    ['Email', 'Name', 'Last Sign In', 'Created At'],
    ...active.map(u => [u.email, u.user_metadata?.name || '', u.last_sign_in_at, u.created_at])
  ]

  const csv = rows.map(r => r.map(v => `"${(v||'').replace(/"/g,'""')}"`).join(',')).join('\n')

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="glowiq-active-users-${year}-${String(month).padStart(2,'0')}.csv"`,
    },
  })
}
