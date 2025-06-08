/**
 * SECURITY FIX: Secure CORS Configuration
 * Addresses trailing slash inconsistency, localhost in production, and implements proper CORS security
 */

import { NextRequest } from 'next/server';

// CORS configuration based on environment
const CORS_CONFIG = {
  // Development allowed origins
  DEVELOPMENT_ORIGINS: [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:3001', // Alternative dev port
    'http://127.0.0.1:3001',
  ],
  
  // Production allowed origins (from environment variables)
  PRODUCTION_ORIGINS: process.env.ALLOWED_ORIGINS 
    ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim().replace(/\/$/, '')) // Remove trailing slashes
    : [],
  
  // Staging/Preview origins
  STAGING_ORIGINS: [
    // Add staging URLs here if needed
  ],
  
  // Default CORS headers
  DEFAULT_HEADERS: {
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Accept, Origin, Cache-Control, Pragma',
    'Access-Control-Max-Age': '86400', // 24 hours
    'Access-Control-Allow-Credentials': 'true',
  },
  
  // Security settings
  SECURITY: {
    // Only allow HTTPS in production (except for localhost)
    REQUIRE_HTTPS_IN_PRODUCTION: true,
    // Block suspicious origins
    BLOCK_SUSPICIOUS_ORIGINS: true,
    // Log CORS violations
    LOG_VIOLATIONS: true,
  }
};

/**
 * SECURITY FIX: Normalizes origin URL by removing trailing slashes and validating format
 */
function normalizeOrigin(origin: string): string {
  if (!origin) return '';
  
  try {
    // Remove trailing slash and normalize
    const normalized = origin.trim().replace(/\/$/, '');
    
    // Validate URL format
    new URL(normalized);
    
    return normalized;
  } catch (error) {
    console.warn(`[CORS] Invalid origin format: ${origin}`);
    return '';
  }
}

/**
 * SECURITY FIX: Gets allowed origins based on environment
 */
function getAllowedOrigins(): string[] {
  const isDevelopment = process.env.NODE_ENV === 'development';
  const isProduction = process.env.NODE_ENV === 'production';
  
  let allowedOrigins: string[] = [];
  
  if (isDevelopment) {
    // Development: Allow localhost and configured origins
    allowedOrigins = [
      ...CORS_CONFIG.DEVELOPMENT_ORIGINS,
      ...CORS_CONFIG.PRODUCTION_ORIGINS, // Also allow production origins for testing
    ];
  } else if (isProduction) {
    // Production: Only allow configured production origins
    allowedOrigins = [
      ...CORS_CONFIG.PRODUCTION_ORIGINS,
      // SECURITY FIX: Don't include localhost in production
    ];
  } else {
    // Staging/Test: Allow staging and production origins
    allowedOrigins = [
      ...CORS_CONFIG.STAGING_ORIGINS,
      ...CORS_CONFIG.PRODUCTION_ORIGINS,
    ];
  }
  
  // Normalize all origins (remove trailing slashes)
  return allowedOrigins
    .map(normalizeOrigin)
    .filter(origin => origin.length > 0);
}

/**
 * SECURITY FIX: Validates if an origin is allowed
 */
function isOriginAllowed(origin: string): boolean {
  if (!origin) return false;
  
  const normalizedOrigin = normalizeOrigin(origin);
  if (!normalizedOrigin) return false;
  
  const allowedOrigins = getAllowedOrigins();
  
  // Check exact match
  if (allowedOrigins.includes(normalizedOrigin)) {
    return true;
  }
  
  // SECURITY FIX: Additional security checks
  try {
    const originUrl = new URL(normalizedOrigin);
    
    // Block suspicious origins
    if (CORS_CONFIG.SECURITY.BLOCK_SUSPICIOUS_ORIGINS) {
      // Block origins with suspicious TLDs or patterns
      const suspiciousTlds = ['.tk', '.ml', '.ga', '.cf'];
      const suspiciousPatterns = [
        /\d+\.\d+\.\d+\.\d+/, // Raw IP addresses (except localhost)
        /localhost\..*/, // Fake localhost domains
        /127\.0\.0\.1\..*/, // Fake localhost domains
      ];
      
      if (suspiciousTlds.some(tld => originUrl.hostname.endsWith(tld))) {
        console.warn(`[CORS] Blocked suspicious TLD: ${normalizedOrigin}`);
        return false;
      }
      
      if (suspiciousPatterns.some(pattern => pattern.test(originUrl.hostname))) {
        // Allow actual localhost in development
        if (process.env.NODE_ENV === 'development' && 
            (originUrl.hostname === 'localhost' || originUrl.hostname === '127.0.0.1')) {
          return true;
        }
        console.warn(`[CORS] Blocked suspicious pattern: ${normalizedOrigin}`);
        return false;
      }
    }
    
    // SECURITY FIX: Require HTTPS in production (except localhost)
    if (CORS_CONFIG.SECURITY.REQUIRE_HTTPS_IN_PRODUCTION && process.env.NODE_ENV === 'production') {
      if (originUrl.protocol !== 'https:' && 
          !['localhost', '127.0.0.1'].includes(originUrl.hostname)) {
        console.warn(`[CORS] Blocked non-HTTPS origin in production: ${normalizedOrigin}`);
        return false;
      }
    }
    
    return false;
  } catch (error) {
    console.warn(`[CORS] Invalid origin URL: ${normalizedOrigin}`);
    return false;
  }
}

/**
 * SECURITY FIX: Logs CORS violations for security monitoring
 */
function logCorsViolation(origin: string, request: NextRequest) {
  if (!CORS_CONFIG.SECURITY.LOG_VIOLATIONS) return;
  
  const clientIP = request.headers.get('x-forwarded-for') || 
                   request.headers.get('x-real-ip') || 
                   'unknown';
  
  const userAgent = request.headers.get('user-agent') || 'unknown';
  
  console.warn(`[CORS VIOLATION] Origin: ${origin}, IP: ${clientIP}, User-Agent: ${userAgent.substring(0, 100)}`);
}

/**
 * SECURITY FIX: Main CORS validation function
 */
export function validateCorsOrigin(request: NextRequest): {
  isAllowed: boolean;
  origin: string | null;
  headers: Record<string, string>;
} {
  const origin = request.headers.get('origin');
  
  // No origin header (same-origin requests or non-browser requests)
  if (!origin) {
    return {
      isAllowed: true,
      origin: null,
      headers: {}, // No CORS headers needed for same-origin
    };
  }
  
  const isAllowed = isOriginAllowed(origin);
  
  if (!isAllowed) {
    logCorsViolation(origin, request);
  }
  
  const corsHeaders = isAllowed ? {
    ...CORS_CONFIG.DEFAULT_HEADERS,
    'Access-Control-Allow-Origin': normalizeOrigin(origin),
  } : {
    // Don't include Access-Control-Allow-Origin for disallowed origins
    ...CORS_CONFIG.DEFAULT_HEADERS,
  };
  
  return {
    isAllowed,
    origin: isAllowed ? normalizeOrigin(origin) : null,
    headers: corsHeaders,
  };
}

/**
 * SECURITY FIX: Handles CORS preflight requests
 */
export function handleCorsPreflightRequest(request: NextRequest) {
  const corsValidation = validateCorsOrigin(request);
  
  if (!corsValidation.isAllowed && corsValidation.origin) {
    // Return 403 for disallowed origins
    return new Response('CORS policy violation', {
      status: 403,
      headers: {
        'Content-Type': 'text/plain',
      },
    });
  }
  
  // Return successful preflight response
  return new Response(null, {
    status: 200,
    headers: corsValidation.headers,
  });
}

/**
 * SECURITY FIX: Adds CORS headers to a response
 */
export function addCorsHeaders(response: Response, request: NextRequest): Response {
  const corsValidation = validateCorsOrigin(request);
  
  // Only add CORS headers if origin is allowed
  if (corsValidation.isAllowed) {
    Object.entries(corsValidation.headers).forEach(([key, value]) => {
      response.headers.set(key, value);
    });
  }
  
  return response;
}

/**
 * SECURITY FIX: Gets current CORS configuration for debugging
 */
export function getCorsConfiguration() {
  return {
    environment: process.env.NODE_ENV,
    allowedOrigins: getAllowedOrigins(),
    securitySettings: CORS_CONFIG.SECURITY,
    developmentMode: process.env.NODE_ENV === 'development',
  };
}

/**
 * SECURITY FIX: Validates CORS configuration on startup
 */
export function validateCorsConfiguration(): {
  isValid: boolean;
  warnings: string[];
  errors: string[];
} {
  const warnings: string[] = [];
  const errors: string[] = [];
  
  const allowedOrigins = getAllowedOrigins();
  
  // Check if any origins are configured
  if (allowedOrigins.length === 0) {
    warnings.push('No CORS origins configured - this may block legitimate requests');
  }
  
  // Check for localhost in production
  if (process.env.NODE_ENV === 'production') {
    const hasLocalhost = allowedOrigins.some(origin => 
      origin.includes('localhost') || origin.includes('127.0.0.1')
    );
    
    if (hasLocalhost) {
      errors.push('Localhost origins found in production configuration');
    }
  }
  
  // Check for trailing slashes (should be normalized)
  const hasTrailingSlashes = allowedOrigins.some(origin => origin.endsWith('/'));
  if (hasTrailingSlashes) {
    warnings.push('Some origins have trailing slashes (will be normalized)');
  }
  
  // Check for HTTP origins in production
  if (process.env.NODE_ENV === 'production') {
    const hasHttpOrigins = allowedOrigins.some(origin => origin.startsWith('http://'));
    if (hasHttpOrigins) {
      warnings.push('HTTP origins found in production - consider using HTTPS only');
    }
  }
  
  return {
    isValid: errors.length === 0,
    warnings,
    errors,
  };
}
