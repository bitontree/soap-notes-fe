import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Define protected routes
const protectedRoutes = [
  '/dashboard',
  '/generate',
  '/history',
  '/ehr',
  '/settings'
]

// Define public routes (login, signup, etc.)
const publicRoutes = [
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password'
]

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  
  // Check if the current path is a protected route
  const isProtectedRoute = protectedRoutes.some(route => 
    pathname.startsWith(route)
  )
  
  // Check if the current path is a public route
  const isPublicRoute = publicRoutes.some(route => 
    pathname.startsWith(route)
  )

  // Get token from cookies or headers - check both access_token and token
  const token = request.cookies.get('access_token')?.value || 
                request.cookies.get('token')?.value || 
                request.headers.get('authorization')?.replace('Bearer ', '')

  // If accessing a protected route without authentication
  if (isProtectedRoute && !token) {
    // Always redirect to login without dynamic redirect params
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // If accessing a public route while authenticated, redirect to dashboard
  if (isPublicRoute && token && pathname !== '/') {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // If accessing root path while authenticated, redirect to dashboard
  if (pathname === '/' && token) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // If accessing root path while not authenticated, redirect to login
  if (pathname === '/' && !token) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!api|_next/static|_next/image|favicon.ico|public).*)',
  ],
}

