/**
 * SECURITY FIX: CORS Middleware Integration
 * Integrates secure CORS handling with existing middleware
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateCorsOrigin, handleCorsPreflightRequest, addCorsHeaders } from './corsConfig';

/**
 * SECURITY FIX: Handles CORS for API routes
 */
export function handleApiCors(request: NextRequest): NextResponse | null {
  // Handle preflight requests (OPTIONS)
  if (request.method === 'OPTIONS') {
    const preflightResponse = handleCorsPreflightRequest(request);
    // Convert Response to NextResponse
    return new NextResponse(preflightResponse.body, {
      status: preflightResponse.status,
      headers: preflightResponse.headers,
    });
  }
  
  // For other requests, validate CORS but don't block here
  // (CORS headers will be added to the response)
  return null;
}

/**
 * SECURITY FIX: Adds CORS headers to API responses
 */
export function addApiCorsHeaders(response: NextResponse, request: NextRequest): NextResponse {
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
 * SECURITY FIX: Validates CORS for API requests and returns appropriate response
 */
export function validateApiCors(request: NextRequest): {
  isAllowed: boolean;
  response?: NextResponse;
} {
  const corsValidation = validateCorsOrigin(request);
  
  // If origin is present but not allowed, block the request
  if (request.headers.get('origin') && !corsValidation.isAllowed) {
    const response = NextResponse.json(
      { 
        error: 'CORS policy violation',
        message: 'Origin not allowed by CORS policy'
      },
      { status: 403 }
    );
    
    return {
      isAllowed: false,
      response,
    };
  }
  
  return {
    isAllowed: true,
  };
}

/**
 * SECURITY FIX: CORS wrapper for API route handlers
 */
export function withCors(
  handler: (request: NextRequest, ...args: any[]) => Promise<NextResponse>
) {
  return async (request: NextRequest, ...args: any[]): Promise<NextResponse> => {
    // Handle preflight requests
    if (request.method === 'OPTIONS') {
      const preflightResponse = handleCorsPreflightRequest(request);
      return new NextResponse(preflightResponse.body, {
        status: preflightResponse.status,
        headers: preflightResponse.headers,
      });
    }
    
    // Validate CORS for actual requests
    const corsValidation = validateApiCors(request);
    if (!corsValidation.isAllowed && corsValidation.response) {
      return corsValidation.response;
    }
    
    try {
      // Execute the original handler
      const response = await handler(request, ...args);
      
      // Add CORS headers to the response
      return addApiCorsHeaders(response, request);
    } catch (error) {
      // Even error responses should have CORS headers
      const errorResponse = NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
      
      return addApiCorsHeaders(errorResponse, request);
    }
  };
}

/**
 * SECURITY FIX: Creates a CORS-enabled response
 */
export function createCorsResponse(
  data: any,
  request: NextRequest,
  init?: ResponseInit
): NextResponse {
  const response = NextResponse.json(data, init);
  return addApiCorsHeaders(response, request);
}

/**
 * SECURITY FIX: CORS configuration validation for startup
 */
export function validateCorsSetup(): void {
  try {
    const { validateCorsConfiguration } = require('./corsConfig');
    const validation = validateCorsConfiguration();
    
    if (validation.errors.length > 0) {
      console.error('[CORS] Configuration errors:');
      validation.errors.forEach((error: string) => console.error(`  - ${error}`));
      
      if (process.env.NODE_ENV === 'production') {
        throw new Error('CORS configuration errors in production');
      }
    }
    
    if (validation.warnings.length > 0) {
      console.warn('[CORS] Configuration warnings:');
      validation.warnings.forEach((warning: string) => console.warn(`  - ${warning}`));
    }
    
    console.log('[CORS] Configuration validated successfully');
  } catch (error) {
    console.warn('[CORS] Could not validate configuration:', error);
  }
}
