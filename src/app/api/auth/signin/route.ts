import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { performServerSideUndeploy } from '@/lib/deploymentUtils';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  console.error('Supabase URL is missing for /api/auth/signin. Check environment variables.');
}

// In-memory map to store login attempts for rate limiting
// Key: username, Value: Array of timestamps (Date.now())
const loginAttempts = new Map<string, number[]>();
const COOLDOWN_SECONDS = 30; // Minimum wait time after logout
const MAX_ATTEMPTS_PER_MINUTE = 3; // Max login attempts within a minute
const BLOCK_DURATION_MS = 60 * 1000; // 1 minute block if rate limit exceeded

const generateSessionToken = (): string => {
  return crypto.randomBytes(32).toString('hex') + Date.now().toString(36);
};

const generateSessionId = (): string => {
  return crypto.randomUUID();
};

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [];
  
  const isXHR = request.headers.get('X-Requested-With') === 'XMLHttpRequest';
  if (!isXHR) {
    return NextResponse.json({ message: 'Invalid request.' }, { status: 403 });
  }

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return NextResponse.json({ message: 'Server configuration error: Supabase (service role) not configured.' }, { status: 500 });
  }

  const supabaseService: SupabaseClient = createClient(supabaseUrl, supabaseServiceRoleKey);

  try {
    const { username, password } = await request.json();

    if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
      return NextResponse.json({ message: 'Username and password are required.' }, { status: 400 });
    }

    const sanitizedUsername = username.trim().toLowerCase();
    if (sanitizedUsername.length > 50 || password.length > 128) {
      return NextResponse.json({ message: 'Invalid input length.' }, { status: 400 });
    }

    const currentTime = Date.now();

    // --- Rate Limiting Logic ---
    let attempts = loginAttempts.get(sanitizedUsername) || [];
    // Filter out attempts older than 1 minute
    attempts = attempts.filter(timestamp => currentTime - timestamp < BLOCK_DURATION_MS);

    if (attempts.length >= MAX_ATTEMPTS_PER_MINUTE) {
      const timeSinceLastAttempt = currentTime - attempts[attempts.length - 1];
      const timeLeftToWait = Math.max(0, BLOCK_DURATION_MS - timeSinceLastAttempt); // Ensure timeLeftToWait is not negative
      if (timeLeftToWait > 0) {
        console.warn(`Rate limit exceeded for user ${sanitizedUsername}. Blocking for ${timeLeftToWait / 1000}s.`);
        return NextResponse.json({ message: `Too many login attempts. Please try again in ${Math.ceil(timeLeftToWait / 1000)} seconds.` }, { status: 429 });
      }
    }
    // Add current attempt
    attempts.push(currentTime);
    loginAttempts.set(sanitizedUsername, attempts);
    // --- End Rate Limiting Logic ---

    const { data: user, error: authError } = await supabaseService
      .from("users")
      .select("id, username, password, active_session_id, login_count, deploy_timestamp, active_form_number, active_run_id, last_logout, token_removed")
      .eq("username", username)
      .single();

    if (authError || !user) {
      console.error('Authentication error or user not found:', authError?.message);
      return NextResponse.json({ message: 'Invalid credentials.' }, { status: 401 });
    }

    // Check if the user's token has been removed by an admin
    if (user.token_removed) {
      console.warn(`Login attempt for user ${sanitizedUsername} blocked: Token removed by admin.`);
      return NextResponse.json({ message: 'Please renew the token to login the application.' }, { status: 403 });
    }

    // --- Logout Cooldown Check ---
    if (user.last_logout) {
      const lastLogoutTime = new Date(user.last_logout).getTime(); // Change last_logout_at to last_logout
      const timeSinceLogout = currentTime - lastLogoutTime;
      if (timeSinceLogout < (COOLDOWN_SECONDS * 1000)) {
        const timeLeft = Math.max(0, (COOLDOWN_SECONDS * 1000) - timeSinceLogout); // Ensure timeLeft is not negative
        console.warn(`User ${sanitizedUsername} attempting to login too soon after logout. Blocking for ${timeLeft / 1000}s.`);
        return NextResponse.json({ message: `Please wait ${Math.ceil(timeLeft / 1000)} seconds before logging in again.` }, { status: 429 });
      }
    }
    // --- End Logout Cooldown Check ---

    const passwordIsValid = await bcrypt.compare(password, user.password);
    if (!passwordIsValid) {
      console.log(`Password validation failed for user: ${username}.`);
      return NextResponse.json({ message: 'Invalid credentials.' }, { status: 401 });
    }

    const newSessionToken = generateSessionToken();
    const newSessionId = generateSessionId();

    if (user.active_session_id) {
      console.log(`[SignIn] User ${user.username} (ID: ${user.id}) is signing in, potentially terminating existing session ${user.active_session_id}.`);

      const hasActiveGitHubRun = user.deploy_timestamp && user.active_run_id;
      const hasActiveLocaltForm = user.deploy_timestamp && user.active_form_number && user.active_form_number > 0;

      if (hasActiveGitHubRun || hasActiveLocaltForm) {
        console.log(`[SignIn] User ${user.username} has an active deployment. GitHub Run: ${user.active_run_id || 'N/A'}, Loca.lt Form: ${user.active_form_number || 'N/A'}. Timestamp: ${user.deploy_timestamp}. Attempting server-side undeploy.`);
        
        const undeployResult = await performServerSideUndeploy(
          user.id.toString(),
          user.username,
          user.deploy_timestamp,
          user.active_form_number,
          user.active_run_id,
          supabaseService
        );

        if (!undeployResult.success) {
          console.error(`[SignIn] Server-side undeploy failed for user ${user.username} during new sign-in. Reason: ${undeployResult.message}`);
          return NextResponse.json({
            message: `Sign-in blocked: Failed to undeploy previous active session. ${undeployResult.message} Please try again or contact support.`
          }, { status: 409 });
        }
        console.log(`[SignIn] Server-side undeploy process completed for user ${user.username}. Result: ${undeployResult.message}`);
      } else {
        console.log(`[SignIn] No active deployment (neither GitHub run nor loca.lt form) found for user ${user.username} to undeploy during new sign-in.`);
      }

      console.log(`[SignIn] Broadcasting session_terminated event for user ${user.id}'s old session.`);
      try {
        const sendStatus = await supabaseService
          .channel('session_updates')
          .send({
            type: 'broadcast',
            event: 'session_terminated',
            payload: { userId: user.id }
          });
        if (sendStatus !== 'ok') {
            console.error("[SignIn] Error broadcasting session termination. Status:", sendStatus);
        }
      } catch (e) {
        console.error("[SignIn] Exception during broadcast for session termination:", e);
      }
    }

    const { error: updateError } = await supabaseService
      .from("users")
      .update({
        session_token: newSessionToken,
        active_session_id: newSessionId,
        login_count: (user.login_count || 0) + 1,
        last_login: new Date().toISOString(),
        last_logout: null, // Clear last_logout on successful login
      })
      .eq("id", user.id);

    if (updateError) {
      console.error('Failed to update user session in DB:', updateError.message);
      return NextResponse.json({ message: 'Failed to update session.' }, { status: 500 });
    }

    const response = NextResponse.json({
      message: 'Sign in successful.',
      username: user.username
    });

    const oneDayInSeconds = 24 * 60 * 60;
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict' as const,
      path: '/',
      maxAge: oneDayInSeconds,
    };

    response.cookies.set('sessionToken', newSessionToken, cookieOptions);
    response.cookies.set('sessionId', newSessionId, cookieOptions);
    response.cookies.set('userId', user.id.toString(), cookieOptions);
    response.cookies.set('username', user.username, cookieOptions);

    return response;

  } catch (error: any) {
    console.error('Error in sign-in API route:', error.message);
    return NextResponse.json({ message: 'An unexpected error occurred during sign in.' }, { status: 500 });
  }
}
