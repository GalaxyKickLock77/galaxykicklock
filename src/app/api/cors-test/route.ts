/**
 * SECURITY FIX: CORS Test API Route
 * Demonstrates proper CORS implementation
 */

import { NextRequest, NextResponse } from 'next/server';
import { withCors, createCorsResponse } from '@/lib/corsMiddleware';

/**
 * GET /api/cors-test - Test CORS configuration
 */
async function handleGet(request: NextRequest): Promise<NextResponse> {
  const origin = request.headers.get('origin');
  
  return createCorsResponse({
    message: 'CORS test successful',
    origin: origin || 'same-origin',
    timestamp: new Date().toISOString(),
    method: request.method,
  }, request);
}

/**
 * POST /api/cors-test - Test CORS with POST request
 */
async function handlePost(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    
    return createCorsResponse({
      message: 'CORS POST test successful',
      receivedData: body,
      timestamp: new Date().toISOString(),
    }, request);
  } catch (error) {
    return createCorsResponse({
      error: 'Invalid JSON in request body',
    }, request, { status: 400 });
  }
}

// SECURITY FIX: Export CORS-wrapped handlers
export const GET = withCors(handleGet);
export const POST = withCors(handlePost);

// OPTIONS is handled automatically by withCors wrapper
