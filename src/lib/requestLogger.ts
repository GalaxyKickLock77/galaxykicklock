/**
 * MINIMAL SECURITY FIX: Request Logging with Cookie Sanitization
 * Only affects logging - does NOT change app functionality
 */

import { NextRequest } from 'next/server';
import { sanitizeCookieHeader } from './cookieHeaderSanitizer';

/**
 * MINIMAL FIX: Enhanced console.log that sanitizes cookies
 * Use this instead of regular console.log for requests
 */
export function secureLog(message: string, data?: any, context?: string) {
  const timestamp = new Date().toISOString();
  const prefix = context ? `[${context}]` : '';
  
  if (data && typeof data === 'object') {
    // If data contains cookie information, sanitize it
    const sanitizedData = { ...data };
    
    // Sanitize cookie headers if present
    if (sanitizedData.cookies && typeof sanitizedData.cookies === 'string') {
      sanitizedData.cookies = sanitizeCookieHeader(sanitizedData.cookies);
    }
    
    // Sanitize cookie header if present
    if (sanitizedData.headers && sanitizedData.headers.cookie) {
      sanitizedData.headers.cookie = sanitizeCookieHeader(sanitizedData.headers.cookie);
    }
    
    console.log(`${timestamp} ${prefix} ${message}`, sanitizedData);
  } else {
    console.log(`${timestamp} ${prefix} ${message}`, data);
  }
}

/**
 * MINIMAL FIX: Log request with automatic cookie sanitization
 */
export function logRequest(request: NextRequest, context: string = 'REQUEST') {
  const cookieHeader = request.headers.get('cookie') || '';
  
  secureLog('Incoming request', {
    method: request.method,
    url: request.url,
    cookies: cookieHeader, // Will be automatically sanitized by secureLog
    userAgent: request.headers.get('user-agent')?.substring(0, 100) || 'unknown',
  }, context);
}

/**
 * MINIMAL FIX: Log authentication attempts with sanitized data
 */
export function logAuthAttempt(
  type: 'user' | 'admin',
  action: 'signin' | 'signout' | 'validate',
  success: boolean,
  request: NextRequest,
  additionalInfo?: any
) {
  const cookieHeader = request.headers.get('cookie') || '';
  
  secureLog(`Auth ${action} ${success ? 'success' : 'failed'}`, {
    type,
    action,
    success,
    url: request.url,
    cookies: cookieHeader, // Will be automatically sanitized
    userAgent: request.headers.get('user-agent')?.substring(0, 100) || 'unknown',
    ...additionalInfo,
  }, 'AUTH');
}

/**
 * MINIMAL FIX: Log API calls with sanitized cookies
 */
export function logApiCall(
  endpoint: string,
  method: string,
  request: NextRequest,
  responseStatus?: number,
  additionalInfo?: any
) {
  const cookieHeader = request.headers.get('cookie') || '';
  
  secureLog(`API call to ${endpoint}`, {
    endpoint,
    method,
    status: responseStatus,
    cookies: cookieHeader, // Will be automatically sanitized
    userAgent: request.headers.get('user-agent')?.substring(0, 50) || 'unknown',
    ...additionalInfo,
  }, 'API');
}
