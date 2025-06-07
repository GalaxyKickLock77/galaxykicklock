import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { performServerSideUndeploy } from '@/lib/deploymentUtils';
import { validateUsername, validatePassword, validateRequestSize } from '@/lib/inputValidation'; // SECURITY FIX: Import validation utilities
import { SecureQueryBuilder, DatabaseConnectionPool } from '@/lib/secureDatabase'; // Import SecureQueryBuilder and DatabaseConnectionPool

// const supabaseUrl = process.env.SUPABASE_URL; // No longer needed here
// const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // No longer needed here

// if (!supabaseUrl) { // Handled by SecureQueryBuilder/DatabaseConnectionPool
//   console.error('Database URL is missing for /api/auth/signin. Check environment variables.');
// }

// SECURITY FIX: Database-backed rate limiting configuration
const COOLDOWN_SECONDS = 30; // Minimum wait time after logout
const MAX_ATTEMPTS_PER_MINUTE = 3; // Max login attempts within a minute
const BLOCK_DURATION_MS = 60 * 1000; // 1 minute block if rate limit exceeded

/**
 * SECURITY FIX: Database-backed rate limiting function
 * Stores and checks login attempts in Supabase for persistence across server restarts
 * and compatibility with multiple server instances
 */
async function checkRateLimit(username: string, queryBuilder: SecureQueryBuilder): Promise<{ allowed: boolean; timeLeftToWait: number }> {
  const currentTime = Date.now();
  const oneMinuteAgo = new Date(currentTime - BLOCK_DURATION_MS).toISOString();
  
  try {
    // Clean up old attempts (older than 1 minute)
    // Note: secureDelete doesn't directly support 'lt'. This is a simplification.
    // For a true 'lt' operation, a raw client or a more complex SecureQueryBuilder method would be needed.
    // Assuming for now that exact 'lt' is not strictly critical or handled differently.
    // A more robust solution might involve a stored procedure or periodic cleanup job.
    // Clean up old attempts (older than 1 minute) - Global cleanup
    const { error: deleteError } = await queryBuilder.secureDelete('login_attempts', {
      attempted_at: { operator: 'lt', value: oneMinuteAgo }
    });

    if (deleteError) {
      // Log the error but don't necessarily block the login attempt due to cleanup failure
      console.error('[checkRateLimit] Error deleting old login attempts:', deleteError.message);
    }

    // Get recent attempts for this username made within the last minute
    const { data: recentAttempts, error: selectError } = await queryBuilder.secureSelect(
      'login_attempts',
      ['attempted_at'], // Only need 'attempted_at' for rate limiting logic
      {
        username: { operator: 'eq', value: username }, // Ensure username is explicitly using 'eq'
        attempted_at: { operator: 'gte', value: oneMinuteAgo }
      },
      { orderBy: { column: 'attempted_at', ascending: false } }
    );

    if (selectError) {
      console.error('Error checking rate limit:', selectError.message);
      // Allow request if we can't check rate limit (fail open for availability)
      return { allowed: true, timeLeftToWait: 0 };
    }

    const attemptCount = recentAttempts?.length || 0;
    
    if (attemptCount >= MAX_ATTEMPTS_PER_MINUTE) {
      // recentAttempts are already filtered by time and sorted by query
      const lastAttemptTime = new Date(recentAttempts[0].attempted_at).getTime();
      const timeSinceLastAttempt = currentTime - lastAttemptTime;
      const timeLeftToWait = Math.max(0, BLOCK_DURATION_MS - timeSinceLastAttempt);
      
      if (timeLeftToWait > 0) {
        return { allowed: false, timeLeftToWait };
      }
    }

    return { allowed: true, timeLeftToWait: 0 };
  } catch (error: any) {
    console.error('Exception in rate limit check:', error.message);
    // Allow request if we can't check rate limit (fail open for availability)
    return { allowed: true, timeLeftToWait: 0 };
  }
}

/**
 * SECURITY FIX: Record login attempt in database
 */
async function recordLoginAttempt(username: string, queryBuilder: SecureQueryBuilder): Promise<void> {
  try {
    await queryBuilder.secureInsert('login_attempts', {
      username: username,
      attempted_at: new Date().toISOString(),
      ip_address: null // Could be enhanced to include IP if needed
    });
  } catch (error: any) {
    console.error('Error recording login attempt:', error.message);
    // Non-critical error, don't block the login process
  }
}

const generateSessionToken = (): string => {
  // SECURITY FIX: Use only cryptographically secure random bytes
  // 48 bytes = 384 bits of entropy, provides excellent security
  return crypto.randomBytes(48).toString('hex');
};

const generateSessionId = (): string => {
  return crypto.randomUUID();
};

export async function POST(request: NextRequest) {
  // TARGETED SECURITY FIX: Filter unnecessary cookies from signin request
  const originalCookieHeader = request.headers.get('cookie') || '';
  if (originalCookieHeader) {
    // Import cookie filtering utility
    const { createFilteredCookieHeader } = await import('@/lib/cookieHeaderFilter');
    
    // Create filtered cookie header (removes sensitive and development cookies)
    const filteredCookieHeader = createFilteredCookieHeader(originalCookieHeader, 'signin');
    
    // Log the filtering for monitoring (optional)
    console.log(`[SIGNIN SECURITY] Cookie filtering applied:`, {
      originalLength: originalCookieHeader.length,
      filteredLength: filteredCookieHeader.length,
      bytesRemoved: originalCookieHeader.length - filteredCookieHeader.length
    });
    
    // Create new headers with filtered cookies
    const newHeaders = new Headers(request.headers);
    if (filteredCookieHeader) {
      newHeaders.set('cookie', filteredCookieHeader);
    } else {
      newHeaders.delete('cookie');
    }

    // Create new request with filtered headers
    request = new NextRequest(request.url, {
      method: request.method,
      headers: newHeaders,
      body: request.body,
    });
  }

  // SECURITY FIX: Validate request size
  const sizeValidation = validateRequestSize(request);
  if (!sizeValidation.isValid) {
    return NextResponse.json({ message: sizeValidation.error }, { status: 413 }); // 413 Payload Too Large
  }

  const origin = request.headers.get('origin');
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [];
  
  const isXHR = request.headers.get('X-Requested-With') === 'XMLHttpRequest';
  if (!isXHR) {
    return NextResponse.json({ message: 'Invalid request.' }, { status: 403 });
  }

  // SecureQueryBuilder will handle its own configuration checks.
  let queryBuilder: SecureQueryBuilder;
  let rawSupabaseClientForUndeploy: any = null;
  let rawSupabaseClientForBroadcast: any = null;

  try {
    queryBuilder = await SecureQueryBuilder.create('service');
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

    // Validate password (basic validation for signin - don't enforce complexity on existing passwords)
    if (!password || typeof password !== 'string') {
      return NextResponse.json({ message: 'Password is required.' }, { status: 400 });
    }
    
    if (password.length > 128) { // Prevent extremely long passwords that could cause DoS
      return NextResponse.json({ message: 'Password is too long.' }, { status: 400 });
    }

    const sanitizedUsername = username.trim().toLowerCase();

    // SECURITY FIX: Database-backed rate limiting
    const rateLimitCheck = await checkRateLimit(sanitizedUsername, queryBuilder);
    if (!rateLimitCheck.allowed) {
      console.warn(`Rate limit exceeded for user (masked). Blocking for ${rateLimitCheck.timeLeftToWait / 1000}s.`);
      return NextResponse.json({ 
        message: `Too many login attempts. Please try again in ${Math.ceil(rateLimitCheck.timeLeftToWait / 1000)} seconds.` 
      }, { status: 429 });
    }

    // Record this login attempt
    await recordLoginAttempt(sanitizedUsername, queryBuilder);

    const currentTime = Date.now(); // SECURITY FIX: Add currentTime back for logout cooldown check

    const { data: user, error: authError } = await queryBuilder.secureSelect(
      "users",
      ["id", "username", "password", "session_token", "active_session_id", "login_count", "deploy_timestamp", "active_form_number", "active_run_id", "last_logout", "token_removed"],
      { username: sanitizedUsername }, // Use sanitizedUsername
      { single: true }
    );

    if (authError || !user) {
      console.error('Authentication error or user not found (masked). AuthError Code:', authError?.code);
      // PGRST116 is "Searched for a single row, but found no rows"
      const message = authError?.code === 'PGRST116' ? 'Invalid credentials.' : (authError?.message || 'Authentication failed.');
      return NextResponse.json({ message }, { status: 401 });
    }

    if (user.token_removed) {
      console.warn(`Login attempt for user (masked) blocked: Token removed by admin.`);
      return NextResponse.json({ message: 'Please renew the token to login the application.' }, { status: 403 });
    }

    if (user.last_logout) {
      const lastLogoutTime = new Date(user.last_logout).getTime();
      const timeSinceLogout = currentTime - lastLogoutTime;
      if (timeSinceLogout < (COOLDOWN_SECONDS * 1000)) {
        const timeLeft = Math.max(0, (COOLDOWN_SECONDS * 1000) - timeSinceLogout);
        console.warn(`User (masked) attempting to login too soon after logout. Blocking for ${timeLeft / 1000}s.`);
        return NextResponse.json({ message: `Please wait ${Math.ceil(timeLeft / 1000)} seconds before logging in again.` }, { status: 429 });
      }
    }

    const passwordIsValid = await bcrypt.compare(password, user.password);
    if (!passwordIsValid) {
      console.log(`Password validation failed for user (masked).`);
      return NextResponse.json({ message: 'Invalid credentials.' }, { status: 401 });
    }

    const newSessionToken = generateSessionToken();
    const newSessionId = generateSessionId();

    const hasActiveSession = user.active_session_id && user.session_token;
    
    if (hasActiveSession) {
      console.log(`[SignIn] User (masked) is signing in with an existing active session (masked). Will terminate old session.`);

      const hasActiveExternalRun = user.deploy_timestamp && user.active_run_id;
      const hasActiveLocaltForm = user.deploy_timestamp && user.active_form_number && user.active_form_number > 0;

      if (hasActiveExternalRun || hasActiveLocaltForm) {
        console.log(`[SignIn] User (masked) has an active deployment. External Run: ${user.active_run_id ? 'masked' : 'N/A'}, Loca.lt Form: ${user.active_form_number ? 'masked' : 'N/A'}. Timestamp: (masked). Attempting server-side undeploy.`);
        
        try {
          rawSupabaseClientForUndeploy = await DatabaseConnectionPool.getInstance().getConnection('service');
          const undeployResult = await performServerSideUndeploy(
            user.id.toString(),
            user.username,
            user.deploy_timestamp,
            user.active_form_number,
            user.active_run_id,
            rawSupabaseClientForUndeploy // Pass raw client
          );

          if (!undeployResult.success) {
            console.error(`[SignIn] Server-side undeploy failed for user (masked) during new sign-in. Reason: ${undeployResult.message}`);
            return NextResponse.json({
              message: `Sign-in blocked: Failed to undeploy previous active session. ${undeployResult.message} Please try again or contact support.`
            }, { status: 409 });
          }
          console.log(`[SignIn] Server-side undeploy process completed for user (masked). Result: ${undeployResult.message}`);
        } catch (undeployError: any) {
            console.error(`[SignIn] Exception during server-side undeploy for user (masked):`, undeployError.message);
            // Potentially return error, or log and proceed depending on policy
        } finally {
          if (rawSupabaseClientForUndeploy) {
            DatabaseConnectionPool.getInstance().releaseConnection(rawSupabaseClientForUndeploy);
          }
        }
      } else {
        console.log(`[SignIn] No active deployment (neither GitHub run nor loca.lt form) found for user (masked) to undeploy during new sign-in.`);
      }

      console.log(`[SignIn] Broadcasting session_terminated event for user ${user.id}'s old session (masked).`);
      try {
        rawSupabaseClientForBroadcast = await DatabaseConnectionPool.getInstance().getConnection('service');
        const sendStatus = await rawSupabaseClientForBroadcast
          .channel('session_updates')
          .send({
            type: 'broadcast',
            event: 'session_terminated',
            payload: {
              userId: user.id,
              reason: 'new_session_opened_elsewhere',
              oldSessionId: 'masked' // Mask the old session ID
            }
          });
        if (sendStatus !== 'ok') {
            console.error("[SignIn] Error broadcasting session termination. Status:", sendStatus);
        }
      } catch (e: any) {
        console.error("[SignIn] Exception during broadcast for session termination (masked).", e.message);
      } finally {
        if (rawSupabaseClientForBroadcast) {
          DatabaseConnectionPool.getInstance().releaseConnection(rawSupabaseClientForBroadcast);
        }
      }
    }

    const { error: updateError } = await queryBuilder.secureUpdate(
      "users",
      {
        session_token: newSessionToken,
        active_session_id: newSessionId,
        login_count: (user.login_count || 0) + 1,
        last_login: new Date().toISOString(),
        last_logout: null, // Clear last_logout on successful login
      },
      { id: user.id }
    );

    if (updateError) {
      console.error('Failed to update user session in DB:', updateError.message);
      return NextResponse.json({ message: 'Failed to update session.' }, { status: 500 });
    }


    const response = NextResponse.json({
      message: 'Sign in successful.'
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
    
    // SECURITY FIX: Handle JSON parsing errors specifically
    if (error instanceof SyntaxError) {
      return NextResponse.json({ message: 'Invalid JSON format in request body.' }, { status: 400 });
    }
    // SecureQueryBuilder might throw its own errors if not caught internally
    const message = error.code === 'DB_ERROR' ? 'A database error occurred.' : error.message;
    return NextResponse.json({ message: `An unexpected error occurred during sign in. ${message}` }, { status: 500 });
  } finally {
    // queryBuilder itself handles releasing its main connection in its methods.
    // Raw clients for undeploy and broadcast are released in their specific try/finally blocks.
  }
}
