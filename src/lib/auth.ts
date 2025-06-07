import { NextRequest, NextResponse } from 'next/server';
// import { createClient, SupabaseClient } from '@supabase/supabase-js'; // Will be removed if not used by other functions
import { performServerSideUndeploy } from '@/lib/deploymentUtils'; // Import performServerSideUndeploy
import { SecureQueryBuilder, DatabaseConnectionPool } from '@/lib/secureDatabase'; // Import SecureQueryBuilder and DatabaseConnectionPool

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

// Ensure global constants are removed if not used elsewhere, which should be the case now.
// import { createClient, SupabaseClient } from '@supabase/supabase-js'; // createClient is no longer directly used in this file.

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

  let queryBuilder: SecureQueryBuilder;
  let rawClient: any = null; // For operations needing a raw Supabase client

  try {
    queryBuilder = await SecureQueryBuilder.create('service');

    const { data: user, error: userError } = await queryBuilder.secureSelect(
      'users',
      ['id', 'username', 'session_token', 'active_session_id', 'deploy_timestamp', 'active_form_number', 'active_run_id', 'token', 'token_removed'],
      { id: requestUserId },
      { single: true }
    );

    if (userError) {
      console.error(`Error fetching user ${requestUserId} (validateSession):`, userError.message, userError.code === 'PGRST116' ? '(User not found)' : '');
      return null;
    }

    if (!user) { // Should be caught by userError with PGRST116, but as a safeguard
      console.log('User not found for ID (validateSession):', requestUserId);
      return null;
    }

    let tokenExpiresAt: string | null = null;
    let isTokenExpired = false;

    if (user.token) {
      const { data: tokenData, error: tokenError } = await queryBuilder.secureSelect(
        'tokengenerate',
        ['expiresat'],
        { token: user.token },
        { single: true }
      );

      if (tokenError) {
        console.error('Error fetching token details from tokengenerate (validateSession):', tokenError.message);
      } else if (tokenData) {
        tokenExpiresAt = tokenData.expiresat;
        if (tokenExpiresAt) {
          const expiryDate = new Date(tokenExpiresAt);
          if (expiryDate < new Date()) {
            isTokenExpired = true;
            console.log(`[validateSession] User ${user.username}'s token has expired.`);
          }
        }
      }
    }

    if (isTokenExpired || user.token_removed) {
      console.log(`[validateSession] Invalidating session for user ${user.username} due to ${isTokenExpired ? 'expired token' : 'admin token removal'}.`);

      try {
        rawClient = await DatabaseConnectionPool.getInstance().getConnection('service');
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
            rawClient // Pass raw client
          );
          if (!undeployResult.success) {
            console.error(`[validateSession] Server-side undeploy failed for user ${user.username} during token expiry/removal. Reason: ${undeployResult.message}`);
          } else {
            console.log(`[validateSession] Server-side undeploy process completed for user ${user.username}. Result: ${undeployResult.message}`);
          }
        }

        const { error: updateError } = await queryBuilder.secureUpdate(
          'users',
          {
            token: null,
            token_removed: true,
            session_token: null,
            active_session_id: null,
            deploy_timestamp: null,
            active_form_number: null,
            active_run_id: null,
            last_logout: new Date().toISOString(),
          },
          { id: requestUserId }
        );

        if (updateError) {
          console.error('Error updating user status after token expiry/removal:', updateError.message);
        }

        await rawClient // Use raw client for broadcast
          .channel('session_updates')
          .send({
            type: 'broadcast',
            event: 'token_expired',
            payload: { userId: user.id, reason: isTokenExpired ? 'token_expired' : 'admin_removed_token' }
          });
        console.log(`[validateSession] Broadcasted token_expired for user ${user.id} due to ${isTokenExpired ? 'expiry' : 'admin removal'}.`);

      } catch (operationError: any) {
        console.error(`[validateSession] Error during token expiry/removal operations for user ${user.id}:`, operationError.message);
      } finally {
        if (rawClient) {
          DatabaseConnectionPool.getInstance().releaseConnection(rawClient);
          rawClient = null; // Reset rawClient
        }
      }
      return null; // Invalidate session
    }

    if (user.session_token === requestToken) {
      if (!user.active_session_id || user.active_session_id !== requestSessionId) {
        console.log(`[validateSession] Updating active_session_id for user ${user.username} from ${user.active_session_id || 'null'} to ${requestSessionId}.`);
        const { error: updateSessionIdError } = await queryBuilder.secureUpdate(
          'users',
          { active_session_id: requestSessionId },
          { id: requestUserId }
        );

        if (updateSessionIdError) {
          console.error('Error updating active_session_id in DB:', updateSessionIdError.message);
        } else {
          if (user.active_session_id && user.active_session_id !== requestSessionId) {
            try {
              rawClient = await DatabaseConnectionPool.getInstance().getConnection('service');
              await rawClient // Use raw client for broadcast
                .channel('session_updates')
                .send({
                  type: 'broadcast',
                  event: 'session_terminated',
                  payload: { userId: user.id, reason: 'new_session_opened_elsewhere' }
                });
              console.log(`[validateSession] Broadcasted session_terminated for user ${user.id} due to new session opened elsewhere.`);
            } catch (broadcastEx: any) {
              console.error(`[validateSession] Exception during session_terminated broadcast for user ${user.id}:`, broadcastEx.message);
            } finally {
              if (rawClient) {
                DatabaseConnectionPool.getInstance().releaseConnection(rawClient);
                rawClient = null; // Reset rawClient
              }
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
        activeRunId: user.active_run_id,
        token: user.token,
        tokenExpiresAt: tokenExpiresAt,
        tokenRemoved: user.token_removed,
        activeSessionId: requestSessionId,
      };
    } else {
      console.log('Session validation failed (validateSession): Session token mismatch.');
      return null;
    }
  } catch (error: any) {
    // This catches errors from SecureQueryBuilder.create or initial cookie access
    console.error('Exception during session validation (validateSession):', error.message);
    return null;
  } finally {
    // Ensure rawClient is released if an unexpected error occurred before its specific finally block
    if (rawClient) {
      DatabaseConnectionPool.getInstance().releaseConnection(rawClient);
    }
    // queryBuilder's connection is managed internally by its methods.
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
  let queryBuilder: SecureQueryBuilder;
  try {
    queryBuilder = await SecureQueryBuilder.create('service');
    const { error } = await queryBuilder.secureUpdate(
      'users',
      { last_logout: timestamp },
      { id: userId }
    );

    if (error) {
      console.error('Error updating user logout timestamp (updateUserLogoutTimestamp):', error.message);
      return false;
    }
    console.log(`Logout timestamp updated for user ${userId}: ${timestamp}`);
    return true;
  } catch (error: any) {
    console.error('Exception during user logout timestamp update (updateUserLogoutTimestamp):', error.message);
    return false;
  } finally {
    // queryBuilder's connection is managed internally by its methods.
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
  let queryBuilder: SecureQueryBuilder;
  try {
    queryBuilder = await SecureQueryBuilder.create('service');
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

    const { error } = await queryBuilder.secureUpdate(
      'users',
      updateData,
      { id: userId }
    );

    if (error) {
      console.error('Error updating user deploy status (updateUserDeployStatus):', error.message);
      return false;
    }
    console.log(`Deploy status updated for user ${userId} (updateUserDeployStatus): timestamp=${deployTimestamp}, form=${activeFormNumber}, runId=${activeRunId === undefined ? '(not changed)' : activeRunId}`);
    return true;
  } catch (error: any) {
    console.error('Exception during user deploy status update (updateUserDeployStatus):', error.message);
    return false;
  } finally {
    // queryBuilder's connection is managed internally by its methods.
  }
}
