import { NextResponse } from 'next/server'

export function middleware(request) {
  const { pathname } = request.nextUrl

  if (pathname.startsWith('/login') || pathname.startsWith('/api/auth')) {
    return NextResponse.next()
  }

  // Check for Supabase auth cookie — full validation happens in the layout
  const hasAuth = request.cookies.getAll().some(c =>
    c.name.startsWith('sb-') && c.name.includes('auth')
  )

  if (!hasAuth) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
