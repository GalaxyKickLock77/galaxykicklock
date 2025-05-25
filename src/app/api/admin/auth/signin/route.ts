import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import bcrypt from 'bcrypt';

const supabaseUrl = process.env.SUPABASE_URL; // SECURITY FIX: Use server-side only URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('Supabase URL or Service Role Key is missing for /api/admin/auth/signin. Check environment variables.');
}

const generateSessionId = (): string => {
  return crypto.randomUUID();
};

const generateSessionToken = (): string => {
  return crypto.randomBytes(32).toString('hex');
};

export async function POST(request: NextRequest) {
  // SECURITY FIX: Add security headers and validations
  const origin = request.headers.get('origin');
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [];
  
  // CSRF protection - check for XMLHttpRequest header
  const isXHR = request.headers.get('X-Requested-With') === 'XMLHttpRequest';
  if (!isXHR) {
    return NextResponse.json({ message: 'Invalid request.' }, { status: 403 });
  }

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return NextResponse.json({ message: 'Server configuration error: Supabase (service role) not configured.' }, { status: 500 });
  }
  const supabase: SupabaseClient = createClient(supabaseUrl, supabaseServiceRoleKey);

  try {
    const { username, password } = await request.json();

    // SECURITY FIX: Enhanced input validation
    if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
      return NextResponse.json({ message: 'Username and password are required.' }, { status: 400 });
    }

    // SECURITY FIX: Input sanitization
    const sanitizedUsername = username.trim().toLowerCase();
    if (sanitizedUsername.length > 50 || password.length > 128) {
      return NextResponse.json({ message: 'Invalid input length.' }, { status: 400 });
    }

    const { data: adminUser, error: dbError } = await supabase
      .from("admin")
      .select("id, username, password")
      .eq("username", sanitizedUsername) // Use sanitized username
      .single();

    if (dbError) {
      console.error("Error querying admin database:", dbError.message);
      return NextResponse.json({ message: "Invalid username or password." }, { status: 401 });
    }

    if (!adminUser) {
      return NextResponse.json({ message: "Invalid username or password." }, { status: 401 });
    }

    const passwordIsValid = await bcrypt.compare(password, adminUser.password);
    if (!passwordIsValid) {
      console.log(`Admin password validation failed for admin: ${sanitizedUsername}.`);
      return NextResponse.json({ message: "Invalid username or password." }, { status: 401 });
    }

    // Authentication successful, generate new admin session details
    const adminSessionId = generateSessionId();
    const adminSessionToken = generateSessionToken();
    const oneDayInSeconds = 24 * 60 * 60;
    const expiresAt = new Date(Date.now() + oneDayInSeconds * 1000).toISOString();

    // Store session in admin_sessions table
    const { error: sessionInsertError } = await supabase
      .from('admin_sessions')
      .insert({
        admin_id: adminUser.id,
        session_id: adminSessionId,
        session_token: adminSessionToken,
        expires_at: expiresAt,
      });

    if (sessionInsertError) {
      console.error('Failed to insert admin session into DB:', sessionInsertError.message);
      return NextResponse.json({ message: 'Failed to create admin session.' }, { status: 500 });
    }

    const response = NextResponse.json({
      message: 'Admin login successful.',
      adminUsername: adminUser.username,
    });

    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict' as const, // SECURITY FIX: Prevent CSRF attacks
      path: '/',
      maxAge: oneDayInSeconds,
    };

    response.cookies.set('adminSessionId', adminSessionId, cookieOptions);
    response.cookies.set('adminSessionToken', adminSessionToken, cookieOptions); // New token cookie
    response.cookies.set('adminId', adminUser.id.toString(), cookieOptions);
    response.cookies.set('adminUsername', adminUser.username, cookieOptions);
    
    return response;

  } catch (error: any) {
    console.error('Error in admin sign-in API route:', error.message);
    return NextResponse.json({ message: 'An unexpected error occurred during admin login.' }, { status: 500 });
  }
}
