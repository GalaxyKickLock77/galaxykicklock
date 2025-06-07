import { NextRequest, NextResponse } from 'next/server';
import { validateSession, updateUserLogoutTimestamp } from '@/lib/auth'; // Import updateUserLogoutTimestamp
import { SecureQueryBuilder } from '@/lib/secureDatabase'; // Import SecureQueryBuilder

// const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL; // No longer needed here
// const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // No longer needed here

// if (!supabaseUrl) { // Handled by SecureQueryBuilder
//   console.error('Supabase URL is missing for /api/auth/signout. Check environment variables.');
// }

export async function POST(request: NextRequest) {
  // validateSession and updateUserLogoutTimestamp will use their own db connections or be refactored later.
  // SecureQueryBuilder is for direct DB operations in this file.

  const session = await validateSession(request); // This call remains as is for now
  if (!session || !session.userId) {
    return NextResponse.json({ message: 'No active session to sign out or authentication invalid.' }, { status: 401 });
  }

  let queryBuilder: SecureQueryBuilder;
  try {
    queryBuilder = await SecureQueryBuilder.create('service');

    // Invalidate session token and active session ID
    const { error: updateSessionError } = await queryBuilder.secureUpdate(
      "users",
      {
        session_token: null,
        active_session_id: null,
      },
      { id: session.userId }
    );

    if (updateSessionError) {
      console.error('Failed to invalidate user session token/ID for signout in DB:', updateSessionError.message);
      return NextResponse.json({ message: 'Failed to update session on server during signout.' }, { status: 500 });
    }

    // Update the last_logout_at timestamp using the new function
    const logoutTimestamp = new Date().toISOString();
    const logoutTimestampUpdated = await updateUserLogoutTimestamp(session.userId, logoutTimestamp); // This call remains as is for now

    if (!logoutTimestampUpdated) {
      console.error('Failed to update last_logout timestamp during signout.'); // Changed last_logout_at to last_logout
      // Decide if this should block signout or just be a warning.
      // For now, let's proceed with signout but log the error.
    }

    const response = NextResponse.json({ message: 'Sign out successful on server.' }, { status: 200 });

    // Clear the session cookies
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict' as const,
      path: '/',
      expires: new Date(0), // Expire immediately
    };

    response.cookies.set('sessionToken', '', cookieOptions);
    response.cookies.set('sessionId', '', cookieOptions);
    response.cookies.set('userId', '', cookieOptions);
    response.cookies.set('username', '', cookieOptions);

    console.log('User session cookies cleared.');
    return response;

  } catch (error: any) {
    console.error('Error in sign-out API route:', error.message);
    const message = error.code === 'DB_ERROR' ? 'A database error occurred during sign out.' : error.message;
    return NextResponse.json({ message: `An unexpected error occurred during sign out. ${message}` }, { status: 500 });
  } finally {
    // queryBuilder itself handles releasing its main connection in its methods, if it was initialized.
    // No explicit release needed here as it's managed internally by secureUpdate.
  }
}
