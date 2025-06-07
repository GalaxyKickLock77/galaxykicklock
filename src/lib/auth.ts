import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { performServerSideUndeploy } from '@/lib/deploymentUtils'; // Import performServerSideUndeploy

// Define a type for your session data
export interface UserSession {
  userId: string;
  username: string; // This would be the username from the users table
  deployTimestamp?: string | null; // ISO string format for timestamp
  activeFormNumber?: number | null;
  activeRunId?: number | string | null; // Add activeRunId
  token?: string | null; // Add token to the session object
  tokenExpiresAt?: string | number | Date | null; // Re-add for the session object type
  lastLogout?: string | null; // Change lastLogoutAt to lastLogout
  tokenRemoved?: boolean | null; // Add tokenRemoved to the session object
  activeSessionId?: string | null; // Add activeSessionId to the session object
}

const supabaseUrl = process.env.SUPABASE_URL; // SECURITY FIX: Server-side only
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // SECURITY FIX: Server-side only

if (!supabaseUrl) {
  console.error('Supabase URL is missing for auth lib. Check environment variables.');
  // Potentially throw an error or handle this state if critical for module loading
}
// Module-level Supabase client removed, will be created with service role key in functions.

/**
 * Validates the session details from cookies against Supabase.
 * 
 * Expects cookies:
 * - 'sessionToken'
 * - 'userId'
 * - 'sessionId'
 * 
 * @param request The NextRequest object (or any object with a `cookies` accessor).
 * @returns The user session object if valid, otherwise null.
 */
export async function validateSession(request: NextRequest): Promise<UserSession | null> {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    console.error('Supabase client not initialized in validateSession due to missing env vars (URL or Service Key).');
    return null;
  }

  // Create a Supabase client with the service role key for this function
  const supabaseService: SupabaseClient = createClient(supabaseUrl, supabaseServiceRoleKey);

  const sessionTokenCookie = request.cookies.get('sessionToken');
  const userIdCookie = request.cookies.get('userId');
  const sessionIdCookie = request.cookies.get('sessionId');

  if (!sessionTokenCookie?.value || !userIdCookie?.value || !sessionIdCookie?.value) {
    console.log('Missing one or more session cookies (sessionToken, userId, sessionId).');
    return null;
  }
  
  const requestToken = sessionTokenCookie.value;
  const requestUserId = userIdCookie.value;
  const requestSessionId = sessionIdCookie.value;

  try {
    const { data: user, error: userError } = await supabaseService // Use service client
      .from('users')
      .select('id, username, session_token, active_session_id, deploy_timestamp, active_form_number, active_run_id, token, token_removed') // Include 'token' and 'token_removed'
      .eq('id', requestUserId)
      .single();

    if (userError) {
      console.error('Error fetching user from Supabase (validateSession):', userError.message);
      return null;
    }

    if (!user) {
      console.log('User not found for ID (validateSession):', requestUserId);
      return null;
    }

    let tokenExpiresAt: string | null = null;
    let isTokenExpired = false;

    if (user.token) {
      const { data: tokenData, error: tokenError } = await supabaseService
        .from('tokengenerate')
        .select('expiresat')
        .eq('token', user.token)
        .single();

      if (tokenError) {
        console.error('Error fetching token details from tokengenerate (validateSession):', tokenError.message);
        // Proceed without token expiry if there's an error fetching it
      } else if (tokenData) {
        tokenExpiresAt = tokenData.expiresat;
        // Only create a Date object if tokenExpiresAt is not null
        if (tokenExpiresAt) {
          const expiryDate = new Date(tokenExpiresAt);
          if (expiryDate < new Date()) {
            isTokenExpired = true;
            console.log(`[validateSession] User ${user.username}'s token has expired.`);
          }
        }
      }
    }

    // If token is expired or marked as removed by admin, invalidate session and update user status
    if (isTokenExpired || user.token_removed) {
      console.log(`[validateSession] Invalidating session for user ${user.username} due to ${isTokenExpired ? 'expired token' : 'admin token removal'}.`);

      // Perform server-side undeploy if there's an active deployment
      const hasActiveGitHubRun = user.deploy_timestamp && user.active_run_id;
      const hasActiveLocaltForm = user.deploy_timestamp && user.active_form_number && user.active_form_number > 0;

      if (hasActiveGitHubRun || hasActiveLocaltForm) {
        console.log(`[validateSession] User ${user.username} has an active deployment. Attempting server-side undeploy.`);
        const undeployResult = await performServerSideUndeploy(
          user.id.toString(),
          user.username,
          user.deploy_timestamp,
          user.active_form_number,
          user.active_run_id,
          supabaseService
        );
        if (!undeployResult.success) {
          console.error(`[validateSession] Server-side undeploy failed for user ${user.username} during token expiry/removal. Reason: ${undeployResult.message}`);
        } else {
          console.log(`[validateSession] Server-side undeploy process completed for user ${user.username}. Result: ${undeployResult.message}`);
        }
      }

      // Update user record to reflect token removal/expiry
      const { error: updateError } = await supabaseService
        .from('users')
        .update({
          token: null,
          token_removed: true, // Ensure this is true if expired or removed
          session_token: null, // Invalidate current session token
          active_session_id: null, // Invalidate current session ID
          deploy_timestamp: null, // Clear deployment status
          active_form_number: null,
          active_run_id: null,
          last_logout: new Date().toISOString(), // Mark as logged out
        })
        .eq('id', requestUserId);

      if (updateError) {
        console.error('Error updating user status after token expiry/removal:', updateError.message);
      }

      // Broadcast session termination event
      try {
        await supabaseService
          .channel('session_updates')
          .send({
            type: 'broadcast',
            event: 'token_expired', // Use existing event for client-side handling
            payload: { userId: user.id, reason: isTokenExpired ? 'token_expired' : 'admin_removed_token' }
          });
        console.log(`[validateSession] Broadcasted token_expired for user ${user.id} due to ${isTokenExpired ? 'expiry' : 'admin removal'}.`);
      } catch (broadcastEx: any) {
        console.error(`[validateSession] Exception during token_expired broadcast for user ${user.id}:`, broadcastEx.message);
      }

      return null; // Invalidate session
    }

    // Validate the session token
    if (user.session_token === requestToken) {
      // If there's no active session ID in the DB, or if it's different from the request's sessionId,
      // then this request's sessionId should become the new active one.
      // This handles initial login and new tab/browser openings.
      if (!user.active_session_id || user.active_session_id !== requestSessionId) {
        console.log(`[validateSession] Updating active_session_id for user ${user.username} from ${user.active_session_id || 'null'} to ${requestSessionId}.`);
        const { error: updateSessionIdError } = await supabaseService
          .from('users')
          .update({ active_session_id: requestSessionId })
          .eq('id', requestUserId);

        if (updateSessionIdError) {
          console.error('Error updating active_session_id in DB:', updateSessionIdError.message);
          // This is a non-critical error for the current request, but might lead to inconsistencies.
        } else {
          // If an old session existed and was different, broadcast termination for it.
          if (user.active_session_id && user.active_session_id !== requestSessionId) {
            try {
              await supabaseService
                .channel('session_updates')
                .send({
                  type: 'broadcast',
                  event: 'session_terminated',
                  payload: { userId: user.id, reason: 'new_session_opened_elsewhere' } // Specific reason
                });
              console.log(`[validateSession] Broadcasted session_terminated for user ${user.id} due to new session opened elsewhere.`);
            } catch (broadcastEx: any) {
              console.error(`[validateSession] Exception during session_terminated broadcast for user ${user.id}:`, broadcastEx.message);
            }
          }
        }
      }

      console.log('Session validated for user (validateSession):', user.username);
      return { 
        userId: user.id.toString(), 
        username: user.username,
        deployTimestamp: user.deploy_timestamp,
        activeFormNumber: user.active_form_number,
        activeRunId: user.active_run_id, // Include activeRunId
        token: user.token, // Include the token value
        tokenExpiresAt: tokenExpiresAt, // Include the fetched expiry
        tokenRemoved: user.token_removed, // Include tokenRemoved status
        activeSessionId: requestSessionId, // Return the request's sessionId as the active one
      };
    } else {
      console.log('Session validation failed (validateSession): Session token mismatch.');
      return null;
    }
  } catch (error: any) {
    console.error('Exception during session validation (validateSession):', error.message);
    return null;
  }
}

/**
 * Updates the last_logout_at timestamp for a user in Supabase.
 * @param userId The ID of the user to update.
 * @param timestamp The timestamp (ISO string) to set, or null to clear.
 * @returns True if successful, false otherwise.
 */
export async function updateUserLogoutTimestamp(
  userId: string,
  timestamp: string | null
): Promise<boolean> {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    console.error('Supabase client not initialized in updateUserLogoutTimestamp due to missing env vars (URL or Service Key).');
    return false;
  }

  const supabaseService = createClient(supabaseUrl, supabaseServiceRoleKey);

  try {
    const { error } = await supabaseService
      .from('users')
      .update({ last_logout: timestamp }) // Change last_logout_at to last_logout
      .eq('id', userId);

    if (error) {
      console.error('Error updating user logout timestamp in Supabase (updateUserLogoutTimestamp):', error.message);
      return false;
    }
    console.log(`Logout timestamp updated for user ${userId}: ${timestamp}`);
    return true;
  } catch (error: any) {
    console.error('Exception during user logout timestamp update (updateUserLogoutTimestamp):', error.message);
    return false;
  }
}


/**
 * Updates the deploy_timestamp and active_form_number for a user in Supabase.
 * @param userId The ID of the user to update.
 * @param deployTimestamp The new deploy timestamp (ISO string) or null.
 * @param activeFormNumber The new active form number or null.
 * @returns True if successful, false otherwise.
 */
export async function updateUserDeployStatus(
  userId: string,
  deployTimestamp: string | null,
  activeFormNumber: number | null,
  activeRunId?: number | string | null // Added activeRunId
): Promise<boolean> {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    console.error('Supabase client not initialized in updateUserDeployStatus due to missing env vars (URL or Service Key).');
    return false;
  }

  // Create a Supabase client with the service role key for this function
  const supabaseService = createClient(supabaseUrl, supabaseServiceRoleKey);

  try {
    const updateData: {
      deploy_timestamp: string | null;
      active_form_number: number | null;
      active_run_id?: number | string | null;
    } = {
      deploy_timestamp: deployTimestamp,
      active_form_number: activeFormNumber,
    };

    if (activeRunId !== undefined) { // Check if activeRunId was passed
      updateData.active_run_id = activeRunId;
    } else if (deployTimestamp === null && activeFormNumber === null) {
      // If clearing deployment, also clear run_id by default if not specified
      updateData.active_run_id = null;
    }
    // If activeRunId is not passed and it's an update (not clearing), active_run_id remains unchanged in DB.

    const { error } = await supabaseService // Use service client
      .from('users')
      .update(updateData)
      .eq('id', userId);

    if (error) {
      console.error('Error updating user deploy status in Supabase (updateUserDeployStatus):', error.message);
      return false;
    }
    console.log(`Deploy status updated for user ${userId} (updateUserDeployStatus): timestamp=${deployTimestamp}, form=${activeFormNumber}, runId=${activeRunId === undefined ? '(not changed)' : activeRunId}`);
    return true;
  } catch (error: any) {
    console.error('Exception during user deploy status update (updateUserDeployStatus):', error.message);
    return false;
  }
}
