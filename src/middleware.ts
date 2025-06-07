import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { validateEnhancedSession, validateEnhancedAdminSession } from '@/lib/enhancedAuth'; // SECURITY FIX: Use enhanced auth
import { addSecurityHeaders } from '@/lib/securityHeaders';
import { validateRequestSize } from '@/lib/requestSizeMiddleware';

// Define paths that are public (don't require authentication)
const PUBLIC_PATHS = [
  '/signin',          // Regular user sign-in page
  '/signup',          // Regular user sign-up page
  '/admin',           // Admin sign-in page (src/app/admin/page.tsx)
  // API routes for authentication are handled by the startsWith('/api/auth/') check below
];

// This function can be marked `async` if using `await` inside
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // SECURITY FIX: Validate request size for all requests
  const sizeValidation = validateRequestSize(request);
  if (!sizeValidation.isValid) {
    const response = NextResponse.json({ message: sizeValidation.error }, { status: 413 });
    return addSecurityHeaders(response, pathname); // SECURITY FIX: Re-enabled with path-aware headers
  }

  // Allow requests to Next.js internals, static files, and public auth API routes
  if (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/api/auth/') || // Covers /api/auth/signin, /api/auth/signup, /api/auth/signout, /api/auth/validate-client-session etc.
    pathname.startsWith('/api/admin/auth/signin') || // Public admin sign-in API
    pathname.includes('.') // Simple check for files like favicon.ico, images, etc.
  ) {
    const response = NextResponse.next();
    return addSecurityHeaders(response, pathname); // SECURITY FIX: Re-enabled with path-aware headers
  }
  
  // Check if the path is explicitly public (e.g., /signin, /signup, /admin/signin pages)
  if (PUBLIC_PATHS.some(path => pathname === path)) { // Use strict equality for specific pages
    const response = NextResponse.next();
    return addSecurityHeaders(response, pathname); // SECURITY FIX: Re-enabled with path-aware headers
  }

  // Handle Admin routes
  if (pathname.startsWith('/admin') || pathname.startsWith('/api/admin')) {
    const adminSession = await validateEnhancedAdminSession(request); // SECURITY FIX: Use enhanced admin session validation
    if (!adminSession) {
      if (pathname.startsWith('/api/admin')) {
        const response = NextResponse.json({ message: 'Admin authentication required.' }, { status: 401 });
        return addSecurityHeaders(response, pathname);
      }
      // Redirect to admin sign-in page (which is /admin)
      const adminSignInUrl = new URL('/admin', request.url); 
      adminSignInUrl.searchParams.set('redirectedFrom', pathname);
      const response = NextResponse.redirect(adminSignInUrl);
      return addSecurityHeaders(response, pathname);
    }
    
    // SECURITY FIX: Handle session upgrade if needed
    if (adminSession.needsUpgrade) {
      console.log('Admin session needs security upgrade');
      // The session will be upgraded automatically on next request
    }
    
    // Admin session is valid. 
    // If the admin is trying to access the login page (/admin) itself while already logged in,
    // we should redirect them to the dashboard.
    if (pathname === '/admin') {
      const response = NextResponse.redirect(new URL('/admin/dashboard', request.url));
      return addSecurityHeaders(response, pathname);
    }
    // Otherwise, proceed
    const response = NextResponse.next();
    return addSecurityHeaders(response, pathname);
  }

  // For all other non-admin protected paths, validate the regular user session
  const userSession = await validateEnhancedSession(request); // SECURITY FIX: Use enhanced user session validation
  if (!userSession) {
    if (pathname.startsWith('/api/')) { // For other API routes (e.g., /api/git)
      const response = NextResponse.json({ message: 'User authentication required.' }, { status: 401 });
      return addSecurityHeaders(response, pathname);
    }
    // Redirect to regular user sign-in page
    const signInUrl = new URL('/signin', request.url);
    signInUrl.searchParams.set('redirectedFrom', pathname);
    const response = NextResponse.redirect(signInUrl);
    return addSecurityHeaders(response, pathname);
  }

  // SECURITY FIX: Handle session upgrade if needed
  if (userSession.needsUpgrade) {
    console.log('User session needs security upgrade');
    // The session will be upgraded automatically on next request
  }

  // User session is valid, proceed
  const response = NextResponse.next();
  return addSecurityHeaders(response, pathname);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - api/auth/ (public authentication API routes for users)
     * - api/admin/auth/signin (public admin sign-in API route)
     *
     * This negative lookahead ensures these paths are NOT processed by the middleware,
     * allowing them to be handled by their respective route handlers or be served directly.
     * All other paths will be processed by the middleware.
     */
    '/((?!_next/static|_next/image|favicon.ico|api/auth/|api/admin/auth/signin).*)',
  ],
};
