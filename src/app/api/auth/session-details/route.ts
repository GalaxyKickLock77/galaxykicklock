import { NextRequest, NextResponse } from 'next/server';
import { validateSession, UserSession } from '@/lib/auth'; // Import UserSession type
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL; // Use server-side only URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  console.error('Supabase URL is missing for /api/auth/session-details. Check environment variables.');
}

export async function GET(request: NextRequest) {
  const session = await validateSession(request);

  if (!session) {
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
