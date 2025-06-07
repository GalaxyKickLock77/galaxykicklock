import { NextRequest, NextResponse } from 'next/server';
import { validateSession, UserSession } from '@/lib/auth'; // Import UserSession type
import { createClient } from '@supabase/supabase-js';
import { logApiCall } from '@/lib/requestLogger'; // MINIMAL SECURITY FIX: Add secure logging

const supabaseUrl = process.env.SUPABASE_URL; // Use server-side only URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  console.error('Supabase URL is missing for /api/auth/session-details. Check environment variables.');
}

export async function GET(request: NextRequest) {
  // MINIMAL SECURITY FIX: Log API call with sanitized cookies (does not affect functionality)
  logApiCall('/api/auth/session-details', 'GET', request);
  
  const session = await validateSession(request);

  if (!session) {
    // MINIMAL SECURITY FIX: Log failed authentication with sanitized data
    logApiCall('/api/auth/session-details', 'GET', request, 401, { reason: 'No valid session' });
    return NextResponse.json({ message: 'Authentication required.' }, { status: 401 });
  }

  // tokenExpiresAt is now directly available from the session object
  // as validateSession now fetches it from the tokengenerate table.
  let tokenExpiresAtToSend: string | number | null = null;
  if (session.tokenExpiresAt) {
    if (session.tokenExpiresAt instanceof Date) {
      tokenExpiresAtToSend = session.tokenExpiresAt.toISOString();
    } else {
      tokenExpiresAtToSend = session.tokenExpiresAt; // Assuming it's already string (ISO) or number
    }
  }

  // MINIMAL SECURITY FIX: Log successful response (cookies are sanitized in logs)
  logApiCall('/api/auth/session-details', 'GET', request, 200, { 
    hasSession: true,
    userId: session.userId ? '[PRESENT]' : '[MISSING]', // Don't log actual user ID
    username: session.username ? '[PRESENT]' : '[MISSING]' // Don't log actual username
  });

  // Return the session details, including the activeSessionId from the validated session
  return NextResponse.json({
    userId: session.userId,
    username: session.username,
    tokenExpiresAt: tokenExpiresAtToSend,
    sessionId: session.activeSessionId, // Return the activeSessionId from the validated session
    deployTimestamp: session.deployTimestamp,
    activeFormNumber: session.activeFormNumber,
  });
}
