/**
 * SECURITY FIX: API Security Wrapper
 * Automatically adds security headers to API responses
 */

import { NextRequest, NextResponse } from 'next/server';
import { addResponseTypeHeaders } from './securityHeaders';

/**
 * Wraps an API route handler with security headers
 */
export function withApiSecurity(handler: (request: NextRequest, ...args: any[]) => Promise<NextResponse>) {
  return async (request: NextRequest, ...args: any[]): Promise<NextResponse> => {
    try {
      const response = await handler(request, ...args);
      
      // Add API-specific security headers
      return addResponseTypeHeaders(response, 'API');
    } catch (error) {
      // Even error responses should have security headers
      const errorResponse = NextResponse.json(
        { message: 'An unexpected error occurred.' },
        { status: 500 }
      );
      
      return addResponseTypeHeaders(errorResponse, 'API');
    }
  };
}

/**
 * Wraps an authentication API route handler with enhanced security headers
 */
export function withAuthApiSecurity(handler: (request: NextRequest, ...args: any[]) => Promise<NextResponse>) {
  return async (request: NextRequest, ...args: any[]): Promise<NextResponse> => {
    try {
      const response = await handler(request, ...args);
      
      // Add auth-specific security headers (includes cache control)
      return addResponseTypeHeaders(response, 'AUTH');
    } catch (error) {
      // Even error responses should have security headers
      const errorResponse = NextResponse.json(
        { message: 'An unexpected error occurred.' },
        { status: 500 }
      );
      
      return addResponseTypeHeaders(errorResponse, 'AUTH');
    }
  };
}

/**
 * Creates a secure API response with appropriate headers
 */
export function createSecureApiResponse(data: any, status: number = 200, isAuth: boolean = false): NextResponse {
  const response = NextResponse.json(data, { status });
  
  if (isAuth) {
    return addResponseTypeHeaders(response, 'AUTH');
  } else {
    return addResponseTypeHeaders(response, 'API');
  }
}

/**
 * Security headers specifically for API endpoints
 */
export const API_SECURITY_HEADERS = {
  // Prevent caching of sensitive API responses
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  'Pragma': 'no-cache',
  'Expires': '0',
  
  // Content security
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  
  // Additional API security
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  
  // CORS security (will be overridden by specific CORS settings if needed)
  'X-Permitted-Cross-Domain-Policies': 'none',
};

/**
 * Adds API security headers to any response
 */
export function addApiSecurityHeaders(response: NextResponse): NextResponse {
  Object.entries(API_SECURITY_HEADERS).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  
  return response;
}
