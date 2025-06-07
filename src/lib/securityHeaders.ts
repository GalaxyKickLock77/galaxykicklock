/**
 * SECURITY FIX: Security headers middleware
 * Adds essential security headers to all responses
 */

import { NextResponse } from 'next/server';
import { SECURITY_HEADERS } from './securityConfig';

/**
 * SECURITY FIX: Selective security headers based on request type
 * Some headers might interfere with Next.js development or specific functionality
 */
export function getSecurityHeadersForPath(pathname: string): Record<string, string> {
  const baseHeaders = {
    'X-Content-Type-Options': 'nosniff',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  };

  // For API routes, add more restrictive headers
  if (pathname.startsWith('/api/')) {
    return {
      ...baseHeaders,
      'X-Frame-Options': 'DENY',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    };
  }

  // For static assets, use minimal headers to avoid breaking functionality
  if (pathname.startsWith('/_next/') || pathname.includes('.')) {
    return {
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    };
  }

  // For regular pages, use full security headers but with Next.js-compatible CSP
  return {
    ...baseHeaders,
    'X-Frame-Options': 'DENY',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Required for Next.js
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: https: blob:",
      "font-src 'self' data: https://fonts.gstatic.com",
      "connect-src 'self' https://sarsafeqetopciqjhzrt.supabase.co wss://sarsafeqetopciqjhzrt.supabase.co",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
      "media-src 'self'",
      "worker-src 'self' blob:",
      "child-src 'self'"
    ].join('; ')
  };
}

/**
 * SECURITY FIX: Adds appropriate security headers based on the request path
 */
export function addSecurityHeaders(response: NextResponse, pathname?: string): NextResponse {
  const headers = pathname ? getSecurityHeadersForPath(pathname) : SECURITY_HEADERS;
  
  Object.entries(headers).forEach(([key, value]) => {
    response.headers.set(key, value);
  });

  return response;
}

/**
 * Creates a new response with security headers
 */
export function createSecureResponse(data: any, init?: ResponseInit, pathname?: string): NextResponse {
  const response = NextResponse.json(data, init);
  return addSecurityHeaders(response, pathname);
}

/**
 * Wraps an API handler with security headers
 */
export function withSecurityHeaders(handler: Function) {
  return async (...args: any[]) => {
    const response = await handler(...args);
    
    if (response instanceof NextResponse) {
      return addSecurityHeaders(response, '/api/');
    }
    
    return response;
  };
}

/**
 * Security headers for different types of responses
 */
export const RESPONSE_SECURITY_HEADERS = {
  API: {
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
  },
  
  AUTH: {
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Clear-Site-Data': '"cache", "cookies", "storage"', // Clear on logout
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
  },
  
  STATIC: {
    'Cache-Control': 'public, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
  }
};

/**
 * Adds specific security headers based on response type
 */
export function addResponseTypeHeaders(response: NextResponse, type: keyof typeof RESPONSE_SECURITY_HEADERS): NextResponse {
  const headers = RESPONSE_SECURITY_HEADERS[type];
  
  Object.entries(headers).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  
  return response;
}

/**
 * SECURITY FIX: Production-ready CSP that's less restrictive for development
 */
export function getProductionCSP(): string {
  const isProduction = process.env.NODE_ENV === 'production';
  
  if (isProduction) {
    return [
      "default-src 'self'",
      "script-src 'self'", // Remove unsafe-inline and unsafe-eval in production
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: https:",
      "font-src 'self' data: https://fonts.gstatic.com",
      "connect-src 'self' https://sarsafeqetopciqjhzrt.supabase.co wss://sarsafeqetopciqjhzrt.supabase.co",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
      "media-src 'self'",
      "worker-src 'self'",
      "child-src 'self'"
    ].join('; ');
  } else {
    // Development CSP - more permissive for hot reload and development tools
    return [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://vercel.live",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: https: blob:",
      "font-src 'self' data: https://fonts.gstatic.com",
      "connect-src 'self' https://sarsafeqetopciqjhzrt.supabase.co wss://sarsafeqetopciqjhzrt.supabase.co https://vercel.live wss://vercel.live ws://localhost:* ws://127.0.0.1:*",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
      "media-src 'self'",
      "worker-src 'self' blob:",
      "child-src 'self'"
    ].join('; ');
  }
}
