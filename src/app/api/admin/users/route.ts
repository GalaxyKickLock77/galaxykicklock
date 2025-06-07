import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { validateAdminSession } from '@/lib/adminAuth';
import { performServerSideUndeploy } from '@/lib/deploymentUtils'; // Import the centralized undeploy function

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL; // URL can often be public
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // Service role key for admin operations

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('Supabase URL or Service Role Key is missing for /api/admin/users. Check environment variables.');
  // Do not initialize supabase client here if config is missing, handle in function
}
// Initialize Supabase client per request or globally if appropriate, ensuring service key is used.
// For this route, it's safer to initialize within the handler to ensure service key is checked.

export async function DELETE(request: NextRequest) {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return NextResponse.json({ message: 'Server configuration error: Supabase (service role) not configured.' }, { status: 500 });
  }
  const supabase: SupabaseClient = createClient(supabaseUrl, supabaseServiceRoleKey);

  const adminSession = await validateAdminSession(request);
  if (!adminSession) {
    return NextResponse.json({ message: 'Admin authentication required.' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const tokenValue = searchParams.get('token'); // The actual token string

    if (!userId || !tokenValue) {
      return NextResponse.json({ message: 'userId and token query parameters are required.' }, { status: 400 });
    }

    // 1. Fetch user details before deletion to get username and session info for broadcast/undeploy
    const { data: userToDelete, error: fetchUserError } = await supabase
      .from('users')
      .select('id, username, active_session_id, deploy_timestamp, active_form_number, active_run_id') // Add active_run_id
      .eq('id', userId)
      .single();

    if (fetchUserError || !userToDelete) {
      console.error(`Error fetching user ${userId} for deletion:`, fetchUserError?.message || 'User not found.');
      return NextResponse.json({ message: `Failed to find user for deletion: ${fetchUserError?.message || 'User not found.'}` }, { status: 404 });
    }

    console.log(`[AdminUsersRoute] Fetched user details for ${userId}:`, userToDelete);

    // 2. Perform server-side undeploy BEFORE invalidating session or deleting user
    // Check if deploy_timestamp is present and active_form_number is a number (including 0)
    if (userToDelete.deploy_timestamp && typeof userToDelete.active_form_number === 'number' && userToDelete.active_form_number >= 0) {
      console.log(`[AdminUsersRoute] User ${userId} has active deployment. Attempting server-side undeploy.`);
      const undeployResult = await performServerSideUndeploy(
        userToDelete.id,
        userToDelete.username,
        userToDelete.deploy_timestamp,
        userToDelete.active_form_number,
        userToDelete.active_run_id, // Pass the fetched active_run_id
        supabase // Pass the service client
      );
      if (!undeployResult.success) {
        console.error(`[AdminUsersRoute] Server-side undeploy for user ${userId} failed: ${undeployResult.message}`);
        // Decide if this should block user deletion or just log. For now, log and proceed.
      } else {
        console.log(`[AdminUsersRoute] Server-side undeploy for user ${userId} successful: ${undeployResult.message}`);
      }
    } else {
      console.log(`[AdminUsersRoute] User ${userId} has no active deployment to undeploy.`);
    }

    // 3. Invalidate the user's session in the database (set session_token and active_session_id to null)
    // This ensures the user is logged out even if the broadcast fails.
    const { error: invalidateSessionError } = await supabase
      .from('users')
      .update({ session_token: null, active_session_id: null })
      .eq('id', userId);

    if (invalidateSessionError) {
      console.error(`[AdminUsersRoute] Error invalidating session for user ${userId}:`, invalidateSessionError.message);
      // Proceed with deletion, but log this issue.
    }

    // 4. Send a Supabase broadcast event to the user's channel
    // This will trigger the client-side logic to show the popup and redirect.
    try {
      await supabase
        .channel('session_updates')
        .send({
          type: 'broadcast',
          event: 'session_terminated',
          payload: { userId: userToDelete.id, reason: 'admin_blocked' }
        });
      console.log(`[AdminUsersRoute] Broadcasted session_terminated for user ${userId}.`);
    } catch (broadcastEx: any) {
      console.error(`[AdminUsersRoute] Exception during broadcast for user ${userId}:`, broadcastEx.message);
    }


    // 5. Delete the associated token from the tokengenerate table
    const { error: tokenDeleteError } = await supabase
      .from('tokengenerate')
      .delete()
      .eq('token', tokenValue);

    if (tokenDeleteError) {
      console.error(`Error deleting token ${tokenValue} from tokengenerate:`, tokenDeleteError.message);
      // Decide if this should block user deletion or just log. For now, log and proceed to delete user.
      // return NextResponse.json({ message: `User deleted, but failed to delete associated token: ${tokenDeleteError.message}` }, { status: 207 });
    }

    // 6. Finally, delete the user record from the users table
    const { error: userDeleteError } = await supabase
      .from('users')
      .delete()
      .eq('id', userId);

    if (userDeleteError) {
      console.error(`Error deleting user ${userId} from users table:`, userDeleteError.message);
      return NextResponse.json({ message: `Failed to delete user record: ${userDeleteError.message}` }, { status: 500 });
    }

    return NextResponse.json({ message: 'User, associated token, and session invalidated successfully.' }, { status: 200 });

  } catch (error: any) {
    console.error('Error in /api/admin/users DELETE route:', error.message);
    return NextResponse.json({ message: 'Failed to delete user and/or token.', error: error.message }, { status: 500 });
  }
}
