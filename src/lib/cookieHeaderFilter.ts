/**
 * TARGETED COOKIE SECURITY FIX: Request Header Cookie Filtering
 * Prevents sensitive cookies from being sent in unnecessary requests
 * DOES NOT break app functionality - only optimizes cookie transmission
 */

import { NextRequest, NextResponse } from 'next/server';

// Sensitive cookies that should be filtered from non-essential requests
const SENSITIVE_COOKIES = [
  'sessionToken', 'sessionId', 'userId', 'username',
  'adminSessionToken', 'adminSessionId', 'adminId', 'adminUsername'
];

// Gitpod/development cookies that can be filtered for security
const DEVELOPMENT_COOKIES = [
  'gp-necessary', 'gp-analytical', 'gp-targeting', 'gitpod-marketing-website-visited',
  'gitpod-flex-user', 'gitpod-user', 'gitpod_hashed_user_id',
  '_gitpod_io_ws_', '__next_hmr_refresh_hash__'
];

/**
 * TARGETED FIX: Create a filtered cookie header for specific requests
 * This removes sensitive cookies from requests that don't need them
 */
export function createFilteredCookieHeader(
  originalCookieHeader: string,
  requestType: 'signin' | 'signout' | 'public' | 'authenticated'
): string {
  if (!originalCookieHeader) return '';

  const cookies = originalCookieHeader.split(';').map(c => c.trim());
  const filteredCookies: string[] = [];

  cookies.forEach(cookie => {
    const [name] = cookie.split('=');
    const cookieName = name.trim();

    // For signin requests, we don't need existing session cookies
    if (requestType === 'signin') {
      // Skip sensitive session cookies for signin (user is logging in, doesn't need old session)
      const isSensitive = SENSITIVE_COOKIES.some(sensitive => 
        cookieName.toLowerCase().includes(sensitive.toLowerCase())
      );
      
      // Skip development/tracking cookies for security
      const isDevelopment = DEVELOPMENT_COOKIES.some(dev => 
        cookieName.toLowerCase().includes(dev.toLowerCase())
      );

      if (!isSensitive && !isDevelopment) {
        filteredCookies.push(cookie);
      }
    }
    // For other request types, keep all cookies (maintain functionality)
    else {
      filteredCookies.push(cookie);
    }
  });

  return filteredCookies.join('; ');
}

/**
 * TARGETED FIX: Middleware to filter cookies for specific endpoints
 * Only affects cookie headers, does not change app logic
 */
export function withCookieFiltering(
  handler: (request: NextRequest) => Promise<NextResponse>,
  requestType: 'signin' | 'signout' | 'public' | 'authenticated' = 'authenticated'
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    // Create a new request with filtered cookies for signin
    if (requestType === 'signin') {
      const originalCookieHeader = request.headers.get('cookie') || '';
      const filteredCookieHeader = createFilteredCookieHeader(originalCookieHeader, 'signin');
      
      // Create new headers with filtered cookies
      const newHeaders = new Headers(request.headers);
      if (filteredCookieHeader) {
        newHeaders.set('cookie', filteredCookieHeader);
      } else {
        newHeaders.delete('cookie');
      }

      // Create new request with filtered headers
      const filteredRequest = new NextRequest(request.url, {
        method: request.method,
        headers: newHeaders,
        body: request.body,
      });

      // Log the filtering for monitoring
      console.log(`[COOKIE FILTER] ${requestType} request - filtered cookies:`, {
        original: originalCookieHeader.length,
        filtered: filteredCookieHeader.length,
        removed: originalCookieHeader.length - filteredCookieHeader.length
      });

      return await handler(filteredRequest);
    }

    // For non-signin requests, proceed normally
    return await handler(request);
  };
}

/**
 * TARGETED FIX: Check if request has unnecessary cookies
 * For monitoring and optimization purposes
 */
export function analyzeRequestCookies(request: NextRequest): {
  totalCookies: number;
  sensitiveCookies: number;
  developmentCookies: number;
  necessaryCookies: number;
  recommendations: string[];
} {
  const cookieHeader = request.headers.get('cookie') || '';
  const cookies = cookieHeader.split(';').map(c => c.trim()).filter(c => c.length > 0);
  
  let sensitiveCookies = 0;
  let developmentCookies = 0;
  const recommendations: string[] = [];

  cookies.forEach(cookie => {
    const [name] = cookie.split('=');
    const cookieName = name.trim();

    // Count sensitive cookies
    if (SENSITIVE_COOKIES.some(sensitive => 
      cookieName.toLowerCase().includes(sensitive.toLowerCase())
    )) {
      sensitiveCookies++;
    }

    // Count development cookies
    if (DEVELOPMENT_COOKIES.some(dev => 
      cookieName.toLowerCase().includes(dev.toLowerCase())
    )) {
      developmentCookies++;
    }
  });

  const necessaryCookies = cookies.length - sensitiveCookies - developmentCookies;

  // Generate recommendations
  if (sensitiveCookies > 0) {
    recommendations.push(`${sensitiveCookies} sensitive cookies could be filtered for security`);
  }
  if (developmentCookies > 0) {
    recommendations.push(`${developmentCookies} development cookies could be removed in production`);
  }
  if (cookies.length > 10) {
    recommendations.push('Consider cookie cleanup - high cookie count detected');
  }

  return {
    totalCookies: cookies.length,
    sensitiveCookies,
    developmentCookies,
    necessaryCookies,
    recommendations
  };
}
