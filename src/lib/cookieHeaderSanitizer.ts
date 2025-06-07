/**
 * MINIMAL COOKIE SECURITY FIX: Request Header Sanitization
 * Only sanitizes cookie headers in logs/monitoring - DOES NOT change app functionality
 */

import { NextRequest } from 'next/server';

// List of sensitive cookie names to mask in headers
const SENSITIVE_COOKIES = [
  'sessionToken', 'sessionId', 'userId', 'username',
  'adminSessionToken', 'adminSessionId', 'adminId', 'adminUsername',
  'token', 'auth', 'session'
];

/**
 * MINIMAL FIX: Sanitize cookie header for logging/monitoring only
 * This does NOT affect actual cookie functionality
 */
export function sanitizeCookieHeader(cookieHeader: string): string {
  if (!cookieHeader) return '';
  
  let sanitized = cookieHeader;
  
  // Replace sensitive cookie values with [MASKED] for logging
  SENSITIVE_COOKIES.forEach(cookieName => {
    // Match cookie=value pattern and replace value with [MASKED]
    const regex = new RegExp(`(${cookieName}=)([^;\\s]+)`, 'gi');
    sanitized = sanitized.replace(regex, `$1[MASKED]`);
  });
  
  // Also mask any long hex strings that look like tokens (32+ chars)
  sanitized = sanitized.replace(/=([a-f0-9]{32,})/gi, '=[MASKED_TOKEN]');
  
  // Mask UUIDs
  sanitized = sanitized.replace(/=([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/gi, '=[MASKED_UUID]');
  
  return sanitized;
}

/**
 * MINIMAL FIX: Get sanitized request info for logging
 * This is for monitoring/debugging only - does not affect app logic
 */
export function getSanitizedRequestInfo(request: NextRequest): {
  url: string;
  method: string;
  sanitizedCookies: string;
  userAgent: string;
} {
  const cookieHeader = request.headers.get('cookie') || '';
  
  return {
    url: request.url,
    method: request.method,
    sanitizedCookies: sanitizeCookieHeader(cookieHeader),
    userAgent: request.headers.get('user-agent')?.substring(0, 100) || 'unknown',
  };
}

/**
 * MINIMAL FIX: Log request with sanitized cookies
 * Use this instead of logging raw request data
 */
export function logSanitizedRequest(request: NextRequest, context: string = '') {
  const sanitizedInfo = getSanitizedRequestInfo(request);
  
  console.log(`[${context}] Request:`, {
    method: sanitizedInfo.method,
    url: sanitizedInfo.url,
    cookies: sanitizedInfo.sanitizedCookies,
    userAgent: sanitizedInfo.userAgent,
  });
}

/**
 * MINIMAL FIX: Check if request has sensitive cookies (for monitoring)
 * This does NOT block requests - only for awareness
 */
export function hasSensitiveCookies(request: NextRequest): {
  hasSensitive: boolean;
  sensitiveCount: number;
  cookieNames: string[];
} {
  const cookieHeader = request.headers.get('cookie') || '';
  const foundSensitive: string[] = [];
  
  SENSITIVE_COOKIES.forEach(cookieName => {
    if (cookieHeader.toLowerCase().includes(cookieName.toLowerCase())) {
      foundSensitive.push(cookieName);
    }
  });
  
  return {
    hasSensitive: foundSensitive.length > 0,
    sensitiveCount: foundSensitive.length,
    cookieNames: foundSensitive,
  };
}
