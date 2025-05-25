import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { validateSession, updateUserLogoutTimestamp } from '@/lib/auth'; // Import updateUserLogoutTimestamp

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  console.error('Supabase URL is missing for /api/auth/signout. Check environment variables.');
}

export async function POST(request: NextRequest) {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return NextResponse.json({ message: 'Server configuration error: Supabase (service role) not configured.' }, { status: 500 });
  }

  const supabaseService: SupabaseClient = createClient(supabaseUrl, supabaseServiceRoleKey);

  const session = await validateSession(request);
  if (!session || !session.userId) {
    return NextResponse.json({ message: 'No active session to sign out or authentication invalid.' }, { status: 401 });
  }

  try {
    // Invalidate session token and active session ID
    const { error: updateSessionError } = await supabaseService
      .from("users")
      .update({
        session_token: null,
        active_session_id: null,
      })
      .eq("id", session.userId);

    if (updateSessionError) {
      console.error('Failed to invalidate user session token/ID for signout in DB:', updateSessionError.message);
      return NextResponse.json({ message: 'Failed to update session on server during signout.' }, { status: 500 });
    }

    // Update the last_logout_at timestamp using the new function
    const logoutTimestamp = new Date().toISOString();
    const logoutTimestampUpdated = await updateUserLogoutTimestamp(session.userId, logoutTimestamp);

    if (!logoutTimestampUpdated) {
      console.error('Failed to update last_logout timestamp during signout.'); // Changed last_logout_at to last_logout
      // Decide if this should block signout or just be a warning.
      // For now, let's proceed with signout but log the error.
    }

    const response = NextResponse.json({ message: 'Sign out successful on server.' }, { status: 200 });

    // Clear the cookies
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: -1, // Expire the cookie immediately
    };
    response.cookies.set('sessionToken', '', cookieOptions);
    response.cookies.set('sessionId', '', cookieOptions);
    response.cookies.set('userId', '', cookieOptions);
    response.cookies.set('username', '', cookieOptions);

    return response;

  } catch (error: any) {
    console.error('Error in sign-out API route:', error.message);
    return NextResponse.json({ message: 'An unexpected error occurred during sign out.' }, { status: 500 });
  }
}
