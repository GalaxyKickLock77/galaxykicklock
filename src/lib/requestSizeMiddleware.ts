/**
 * SECURITY FIX: Request size middleware to prevent DoS attacks
 * This middleware enforces request size limits globally
 */

import { NextRequest, NextResponse } from 'next/server';

// Request size limits in bytes
export const REQUEST_SIZE_LIMITS = {
  DEFAULT: 1024 * 1024, // 1MB default
  AUTH: 1024, // 1KB for auth requests (small JSON payloads)
  UPLOAD: 10 * 1024 * 1024, // 10MB for file uploads
  API: 100 * 1024, // 100KB for API requests
};

/**
 * Validates request size based on the endpoint
 */
export function validateRequestSize(request: NextRequest, customLimit?: number): { isValid: boolean; error?: string } {
  const contentLength = request.headers.get('content-length');
  const pathname = request.nextUrl.pathname;
  
  // Determine appropriate size limit based on endpoint
  let sizeLimit = customLimit || REQUEST_SIZE_LIMITS.DEFAULT;
  
  if (pathname.startsWith('/api/auth/')) {
    sizeLimit = REQUEST_SIZE_LIMITS.AUTH;
  } else if (pathname.startsWith('/api/admin/')) {
    sizeLimit = REQUEST_SIZE_LIMITS.AUTH;
  } else if (pathname.includes('/upload')) {
    sizeLimit = REQUEST_SIZE_LIMITS.UPLOAD;
  } else if (pathname.startsWith('/api/')) {
    sizeLimit = REQUEST_SIZE_LIMITS.API;
  }
  
  if (contentLength) {
    const size = parseInt(contentLength, 10);
    
    if (isNaN(size)) {
      return { 
        isValid: false, 
        error: 'Invalid content-length header.' 
      };
    }
    
    if (size > sizeLimit) {
      return { 
        isValid: false, 
        error: `Request size (${formatBytes(size)}) exceeds maximum allowed size (${formatBytes(sizeLimit)}).` 
      };
    }
  }
  
  return { isValid: true };
}

/**
 * Formats bytes into human-readable format
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Middleware function to check request size
 */
export function withRequestSizeLimit(handler: Function, customLimit?: number) {
  return async (request: NextRequest, ...args: any[]) => {
    const sizeValidation = validateRequestSize(request, customLimit);
    
    if (!sizeValidation.isValid) {
      return NextResponse.json(
        { message: sizeValidation.error }, 
        { status: 413 } // 413 Payload Too Large
      );
    }
    
    return handler(request, ...args);
  };
}
