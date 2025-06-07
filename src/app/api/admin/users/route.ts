import { NextRequest, NextResponse } from 'next/server';
import { validateAdminSession } from '@/lib/adminAuth';
import { performServerSideUndeploy } from '@/lib/deploymentUtils'; // Import the centralized undeploy function
import { SecureQueryBuilder, DatabaseConnectionPool } from '@/lib/secureDatabase'; // Import SecureQueryBuilder and DatabaseConnectionPool

// const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL; // No longer needed here
// const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // No longer needed here

// if (!supabaseUrl || !supabaseServiceRoleKey) { // Handled by SecureQueryBuilder/DatabaseConnectionPool
//   console.error('Supabase URL or Service Role Key is missing for /api/admin/users. Check environment variables.');
// }

export async function DELETE(request: NextRequest) {
  // Initialization of queryBuilder will happen after admin session validation potentially
  // to ensure resources are used only when necessary.

  const adminSession = await validateAdminSession(request);
  if (!adminSession) {
    return NextResponse.json({ message: 'Admin authentication required.' }, { status: 401 });
  }

  let queryBuilder: SecureQueryBuilder | null = null;
  let rawSupabaseClientForUndeploy: any = null; // Using 'any' for SupabaseClient type from pool
  let rawSupabaseClientForBroadcast: any = null;

  try {
    queryBuilder = await SecureQueryBuilder.create('service');
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const tokenValue = searchParams.get('token'); // The actual token string

    if (!userId || !tokenValue) {
      return NextResponse.json({ message: 'userId and token query parameters are required.' }, { status: 400 });
    }

    // 1. Fetch user details before deletion
    const { data: userToDelete, error: fetchUserError } = await queryBuilder.secureSelect(
      'users',
      ['id', 'username', 'active_session_id', 'deploy_timestamp', 'active_form_number', 'active_run_id'],
      { id: userId },
      { single: true }
    );

    if (fetchUserError || !userToDelete) {
      console.error(`Error fetching user ${userId} for deletion:`, fetchUserError?.message || 'User not found.');
      const status = fetchUserError?.code === 'PGRST116' ? 404 : 500; // PGRST116: "Searched for a single row, but found no rows"
      return NextResponse.json({ message: `Failed to find user for deletion: ${fetchUserError?.message || 'User not found.'}` }, { status });
    }

    console.log(`[AdminUsersRoute] Fetched user details for ${userId}:`, userToDelete);

    // 2. Perform server-side undeploy
    if (userToDelete.deploy_timestamp && typeof userToDelete.active_form_number === 'number' && userToDelete.active_form_number >= 0) {
      console.log(`[AdminUsersRoute] User ${userId} has active deployment. Attempting server-side undeploy.`);
      try {
        rawSupabaseClientForUndeploy = await DatabaseConnectionPool.getInstance().getConnection('service');
        const undeployResult = await performServerSideUndeploy(
          userToDelete.id,
          userToDelete.username,
          userToDelete.deploy_timestamp,
          userToDelete.active_form_number,
          userToDelete.active_run_id,
          rawSupabaseClientForUndeploy // Pass the raw client
        );
        if (!undeployResult.success) {
          console.error(`[AdminUsersRoute] Server-side undeploy for user ${userId} failed: ${undeployResult.message}`);
        } else {
          console.log(`[AdminUsersRoute] Server-side undeploy for user ${userId} successful: ${undeployResult.message}`);
        }
      } catch (undeployError: any) {
        console.error(`[AdminUsersRoute] Exception during server-side undeploy for user ${userId}:`, undeployError.message);
      } finally {
        if (rawSupabaseClientForUndeploy) {
          DatabaseConnectionPool.getInstance().releaseConnection(rawSupabaseClientForUndeploy);
        }
      }
    } else {
      console.log(`[AdminUsersRoute] User ${userId} has no active deployment to undeploy.`);
    }

    // 3. Invalidate the user's session in the database
    const { error: invalidateSessionError } = await queryBuilder.secureUpdate(
      'users',
      { session_token: null, active_session_id: null },
      { id: userId }
    );

    if (invalidateSessionError) {
      console.error(`[AdminUsersRoute] Error invalidating session for user ${userId}:`, invalidateSessionError.message);
      // Proceed with deletion, but log this issue.
    }

    // 4. Send a Supabase broadcast event
    try {
      rawSupabaseClientForBroadcast = await DatabaseConnectionPool.getInstance().getConnection('service');
      await rawSupabaseClientForBroadcast
        .channel('session_updates')
        .send({
          type: 'broadcast',
          event: 'session_terminated',
          payload: { userId: userToDelete.id, reason: 'admin_blocked' }
        });
      console.log(`[AdminUsersRoute] Broadcasted session_terminated for user ${userId}.`);
    } catch (broadcastEx: any) {
      console.error(`[AdminUsersRoute] Exception during broadcast for user ${userId}:`, broadcastEx.message);
    } finally {
      if (rawSupabaseClientForBroadcast) {
        DatabaseConnectionPool.getInstance().releaseConnection(rawSupabaseClientForBroadcast);
      }
    }

    // 5. Delete the associated token from the tokengenerate table
    const { error: tokenDeleteError } = await queryBuilder.secureDelete(
      'tokengenerate',
      { token: tokenValue }
    );

    if (tokenDeleteError) {
      console.error(`Error deleting token ${tokenValue} from tokengenerate:`, tokenDeleteError.message);
      // Log and proceed.
    }

    // 6. Finally, delete the user record from the users table
    const { error: userDeleteError } = await queryBuilder.secureDelete(
      'users',
      { id: userId }
    );

    if (userDeleteError) {
      console.error(`Error deleting user ${userId} from users table:`, userDeleteError.message);
      return NextResponse.json({ message: `Failed to delete user record: ${userDeleteError.message}` }, { status: 500 });
    }

    return NextResponse.json({ message: 'User, associated token, and session invalidated successfully.' }, { status: 200 });

  } catch (error: any) {
    console.error('Error in /api/admin/users DELETE route:', error.message);
    // SecureQueryBuilder might throw its own errors if not caught internally
    const message = error.code === 'DB_ERROR' ? 'A database error occurred.' : error.message;
    return NextResponse.json({ message: `Failed to delete user and/or token. ${message}` }, { status: 500 });
  } finally {
    // queryBuilder itself handles releasing its main connection in its methods
    // We've handled releasing raw clients for undeploy and broadcast
  }
}
