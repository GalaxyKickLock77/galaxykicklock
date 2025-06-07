import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import bcrypt from 'bcrypt';
import { validateAuthInput, validateRequestSize } from '@/lib/inputValidation'; // SECURITY FIX: Import validation utilities

const supabaseUrl = process.env.SUPABASE_URL; // SECURITY FIX: Use server-side only URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  console.error('Supabase URL is missing for /api/auth/signup. Check environment variables.');
}

const SALT_ROUNDS = 12; // SECURITY FIX: Increased from 10 to 12 for better security

export async function POST(request: NextRequest) {
  // SECURITY FIX: Validate request size
  const sizeValidation = validateRequestSize(request);
  if (!sizeValidation.isValid) {
    return NextResponse.json({ message: sizeValidation.error }, { status: 413 }); // 413 Payload Too Large
  }

  // SECURITY FIX: Add CSRF protection
  const isXHR = request.headers.get('X-Requested-With') === 'XMLHttpRequest';
  if (!isXHR) {
    return NextResponse.json({ message: 'Invalid request.' }, { status: 403 });
  }

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return NextResponse.json({ message: 'Server configuration error: Supabase (service role) not configured.' }, { status: 500 });
  }

  const supabaseService: SupabaseClient = createClient(supabaseUrl, supabaseServiceRoleKey);

  try {
    const requestData = await request.json();

    // SECURITY FIX: Signup-specific input validation (more permissive than strict auth validation)
    const { username, password, token: signupToken } = requestData;

    // Validate username for signup
    if (!username || typeof username !== 'string') {
      return NextResponse.json({ message: 'Username is required.' }, { status: 400 });
    }
    
    const trimmedUsername = username.trim();
    if (trimmedUsername.length < 3) {
      return NextResponse.json({ message: 'Username must be at least 3 characters long.' }, { status: 400 });
    }
    
    if (trimmedUsername.length > 50) {
      return NextResponse.json({ message: 'Username must not exceed 50 characters.' }, { status: 400 });
    }
    
    // Check for dangerous patterns only (not restrictive character sets)
    const dangerousPatterns = [
      /<script[^>]*>/i, // Script tags
      /javascript:/i, // JavaScript protocol
      /on\w+\s*=/i, // Event handlers like onclick=
      /(union\s+select|drop\s+table|delete\s+from|insert\s+into)/i, // SQL injection with spaces
    ];
    
    for (const pattern of dangerousPatterns) {
      if (pattern.test(trimmedUsername)) {
        return NextResponse.json({ message: 'Username contains invalid characters.' }, { status: 400 });
      }
    }

    // Validate password for signup (enforce complexity for new users)
    if (!password || typeof password !== 'string') {
      return NextResponse.json({ message: 'Password is required.' }, { status: 400 });
    }
    
    if (password.length < 8) {
      return NextResponse.json({ message: 'Password must be at least 8 characters long.' }, { status: 400 });
    }
    
    if (password.length > 128) {
      return NextResponse.json({ message: 'Password must not exceed 128 characters.' }, { status: 400 });
    }
    
    // Check for basic password complexity (at least 3 of 4 character types)
    let complexityScore = 0;
    if (/[a-z]/.test(password)) complexityScore++; // lowercase
    if (/[A-Z]/.test(password)) complexityScore++; // uppercase
    if (/[0-9]/.test(password)) complexityScore++; // numbers
    if (/[^a-zA-Z0-9]/.test(password)) complexityScore++; // special characters
    
    if (complexityScore < 3) {
      return NextResponse.json({ 
        message: 'Password must contain at least 3 of the following: lowercase letters, uppercase letters, numbers, or special characters.' 
      }, { status: 400 });
    }
    
    // Check for common weak passwords
    const weakPasswords = ['password', '12345678', 'qwerty123', 'admin123', 'password123'];
    if (weakPasswords.includes(password.toLowerCase())) {
      return NextResponse.json({ message: 'Password is too common. Please choose a stronger password.' }, { status: 400 });
    }

    // Validate token
    if (!signupToken || typeof signupToken !== 'string') {
      return NextResponse.json({ message: 'Token is required for signup.' }, { status: 400 });
    }
    
    const trimmedToken = signupToken.trim();
    if (trimmedToken.length < 10) {
      return NextResponse.json({ message: 'Invalid token format.' }, { status: 400 });
    }
    
    if (trimmedToken.length > 500) {
      return NextResponse.json({ message: 'Token is too long.' }, { status: 400 });
    }
    
    // Check for basic token format (should be alphanumeric with common token characters)
    if (!/^[a-zA-Z0-9._-]+$/.test(trimmedToken)) {
      return NextResponse.json({ message: 'Token contains invalid characters.' }, { status: 400 });
    }

    // Use sanitized values
    const sanitizedUsername = trimmedUsername;
    const sanitizedToken = trimmedToken;

    // SECURITY FIX: Additional token validation
    if (sanitizedToken.length < 10 || sanitizedToken.length > 500) {
      return NextResponse.json({ message: 'Invalid token format.' }, { status: 400 });
    }

    // 1. Verify Token (from client-side verifyToken)
    const { data: tokenDataArray, error: tokenVerifyError } = await supabaseService
      .from('tokengenerate')
      .select('*')
      .eq('token', sanitizedToken);

    if (tokenVerifyError) {
      console.error('Error verifying token in DB:', tokenVerifyError.message);
      return NextResponse.json({ message: 'Token verification failed. Please try again.' }, { status: 500 });
    }
    
    if (!tokenDataArray || tokenDataArray.length === 0) {
      return NextResponse.json({ message: 'Invalid token provided.' }, { status: 400 });
    }
    
    const tokenEntry = tokenDataArray[0];
    if (tokenEntry.status === 'InUse') {
      return NextResponse.json({ message: 'Token has already been used.' }, { status: 400 });
    }

    // SECURITY FIX: Check token expiry
    if (tokenEntry.expiresat && new Date(tokenEntry.expiresat) < new Date()) {
      return NextResponse.json({ message: 'Token has expired.' }, { status: 400 });
    }

    // 2. Hash password and Insert User
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    const { data: newUser, error: userInsertError } = await supabaseService
      .from("users")
      .insert([{ username: sanitizedUsername, password: hashedPassword, token: sanitizedToken }])
      .select()
      .single();

    if (userInsertError) {
      if (userInsertError.code === '23505') { // Unique constraint violation
        return NextResponse.json({ message: 'Username already taken. Please try a different one.' }, { status: 409 });
      }
      console.error('Error inserting user:', userInsertError.message);
      return NextResponse.json({ message: 'Failed to create user.' }, { status: 500 });
    }

    if (!newUser || !newUser.id) {
      console.error('User insertion did not return expected data.');
      return NextResponse.json({ message: 'Failed to create user (unexpected data).' }, { status: 500 });
    }
    
    const userId = newUser.id;

    // 3. Associate Token with User & Update Token Status
    const { error: tokenUpdateError } = await supabaseService
      .from('tokengenerate')
      .update({ userid: userId, status: 'InUse' })
      .eq('token', sanitizedToken);

    if (tokenUpdateError) {
      console.error('Error updating token status/association:', tokenUpdateError.message);
      return NextResponse.json({ message: 'User created, but failed to update token status.' }, { status: 500 });
    }

    return NextResponse.json({ message: 'Signup successful!' }, { status: 201 });

  } catch (error: any) {
    console.error('Error in sign-up API route:', error.message);
    
    // SECURITY FIX: Handle JSON parsing errors specifically
    if (error instanceof SyntaxError) {
      return NextResponse.json({ message: 'Invalid JSON format in request body.' }, { status: 400 });
    }
    
    return NextResponse.json({ message: 'An unexpected error occurred during sign up.' }, { status: 500 });
  }
}
