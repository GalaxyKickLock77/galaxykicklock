import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { validateUsername, validateRequestSize } from '@/lib/inputValidation'; // SECURITY FIX: Import validation utilities

const supabaseUrl = process.env.SUPABASE_URL; // SECURITY FIX: Use server-side only URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('Supabase URL or Service Role Key is missing for /api/admin/auth/signin. Check environment variables.');
}

const generateSessionId = (): string => {
  return crypto.randomUUID();
};

const generateSessionToken = (): string => {
  // SECURITY FIX: Use only cryptographically secure random bytes
  // 48 bytes = 384 bits of entropy, provides excellent security
  return crypto.randomBytes(48).toString('hex');
};

export async function POST(request: NextRequest) {
  // SECURITY FIX: Validate request size
  const sizeValidation = validateRequestSize(request);
  if (!sizeValidation.isValid) {
    return NextResponse.json({ message: sizeValidation.error }, { status: 413 }); // 413 Payload Too Large
  }

  // SECURITY FIX: Add security headers and validations
  const origin = request.headers.get('origin');
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [];
  
  // CSRF protection - Removed strict XMLHttpRequest header check to prevent blocking legitimate requests.
  // Other CSRF protections (e.g., SameSite=Strict cookies) are still in place.

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return NextResponse.json({ message: 'Server configuration error: Supabase (service role) not configured.' }, { status: 500 });
  }
  const supabase: SupabaseClient = createClient(supabaseUrl, supabaseServiceRoleKey);

  try {
    const requestData = await request.json();

    // SECURITY FIX: Enhanced input validation
    const { username, password } = requestData;

    // Validate username (less strict for existing users)
    if (!username || typeof username !== 'string') {
      return NextResponse.json({ message: 'Username is required.' }, { status: 400 });
    }
    
    if (username.trim().length === 0 || username.trim().length > 50) {
      return NextResponse.json({ message: 'Invalid username format.' }, { status: 400 });
    }

    // Validate password (basic validation for signin)
    if (!password || typeof password !== 'string') {
      return NextResponse.json({ message: 'Password is required.' }, { status: 400 });
    }
    
    if (password.length > 128) { // Prevent extremely long passwords that could cause DoS
      return NextResponse.json({ message: 'Password is too long.' }, { status: 400 });
    }

    // SECURITY FIX: Input sanitization (removed .toLowerCase() for case-sensitive usernames)
    const sanitizedUsername = username.trim();

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
    const sessionExpiresAt = new Date(Date.now() + oneDayInSeconds * 1000).toISOString(); // Renamed expiresAt to sessionExpiresAt

    // Store session directly in the admin table
    const { error: sessionUpdateError } = await supabase
      .from('admin') // Update the admin table
      .update({
        session_id: adminSessionId,
        session_token: adminSessionToken,
        session_expires_at: sessionExpiresAt, // New column name
      })
      .eq('id', adminUser.id); // Update for the specific admin user

    if (sessionUpdateError) {
      console.error('Failed to update admin session in DB:', sessionUpdateError.message);
      return NextResponse.json({ message: 'Failed to create admin session.' }, { status: 500 });
    }

    const response = NextResponse.json({
      message: 'Admin login successful.',
      adminUsername: adminUser.username,
    });

    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict' as const,
      path: '/',
      maxAge: 8 * 60 * 60, // 8 hours
    };

    response.cookies.set('adminSessionId', adminSessionId, cookieOptions);
    response.cookies.set('adminSessionToken', adminSessionToken, cookieOptions);
    response.cookies.set('adminId', adminUser.id.toString(), cookieOptions);
    response.cookies.set('adminUsername', adminUser.username, cookieOptions);
    
    return response;

  } catch (error: any) {
    console.error('Error in admin sign-in API route:', error.message);
    
    // SECURITY FIX: Handle JSON parsing errors specifically
    if (error instanceof SyntaxError) {
      return NextResponse.json({ message: 'Invalid JSON format in request body.' }, { status: 400 });
    }
    
    return NextResponse.json({ message: 'An unexpected error occurred during admin login.' }, { status: 500 });
  }
}
