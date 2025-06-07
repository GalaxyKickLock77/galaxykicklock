import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function POST(request: NextRequest) {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    console.error('Supabase URL or Service Role Key is missing for /api/admin/auth/signout. Check environment variables.');
    return NextResponse.json({ message: 'Server configuration error: Supabase not configured.' }, { status: 500 });
  }

  const supabaseService: SupabaseClient = createClient(supabaseUrl, supabaseServiceRoleKey);

  try {
    const adminSessionId = request.cookies.get('adminSessionId')?.value;

    if (adminSessionId) {
      // Invalidate the session in the database
      const { error: dbError } = await supabaseService
        .from('admin_sessions')
        .delete()
        .eq('session_id', adminSessionId);

      if (dbError) {
        console.error('Failed to invalidate admin session in DB:', dbError.message);
        // Continue to clear cookies even if DB invalidation fails, to ensure client-side logout.
      } else {
        console.log(`Admin session ${adminSessionId} invalidated in DB.`);
      }
    } else {
      console.log('No adminSessionId found in cookies for server-side invalidation.');
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
    return NextResponse.json({ message: 'An unexpected error occurred during admin sign out.' }, { status: 500 });
  }
}
