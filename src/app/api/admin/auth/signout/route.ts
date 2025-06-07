import { NextRequest, NextResponse } from 'next/server';
import { SecureQueryBuilder } from '@/lib/secureDatabase'; // Import SecureQueryBuilder

// const supabaseUrl = process.env.SUPABASE_URL; // No longer needed
// const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // No longer needed

export async function POST(request: NextRequest) {
  // SecureQueryBuilder will handle its own configuration checks
  let queryBuilder: SecureQueryBuilder;

  try {
    queryBuilder = await SecureQueryBuilder.create('service');
    const adminId = request.cookies.get('adminId')?.value;

    if (adminId) {
      // Nullify session fields in the admin table for the given adminId
      const { error: dbError } = await queryBuilder.secureUpdate(
        "admin",
        {
          session_id: null,
          session_token: null,
          session_expires_at: null
        },
        { id: adminId } // Filter by adminId
      );

      if (dbError) {
        console.error(`Failed to nullify admin session in DB for adminId ${adminId}:`, dbError.message);
        // Continue to clear cookies even if DB invalidation fails, to ensure client-side logout.
      } else {
        console.log(`Admin session fields nullified in DB for adminId ${adminId}.`);
      }
    } else {
      console.log('No adminId found in cookies for server-side session invalidation.');
    }

    const response = NextResponse.json({ message: 'Admin sign out successful.' }, { status: 200 });

    // Clear the admin cookies
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: -1, // Expire the cookie immediately
      sameSite: 'strict' as const,
    };

    response.cookies.set('adminSessionId', '', cookieOptions);
    response.cookies.set('adminSessionToken', '', cookieOptions);
    response.cookies.set('adminId', '', cookieOptions);
    response.cookies.set('adminUsername', '', cookieOptions);

    console.log('Admin cookies cleared.');
    return response;

  } catch (error: any) {
    console.error('Error in admin sign-out API route:', error.message);
    const message = error.code === 'DB_ERROR' ? 'A database error occurred during sign out.' : error.message;
    return NextResponse.json({ message: `An unexpected error occurred during admin sign out. ${message}` }, { status: 500 });
  } finally {
    // queryBuilder itself handles releasing its main connection in its methods.
  }
}
