import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { validateAdminSession } from '@/lib/adminAuth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('Supabase URL or Service Role Key is missing for /api/admin/user-token-link. Check environment variables.');
}
// Supabase client will be initialized within the handler using the service role key.

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
    const tokenValue = searchParams.get('token');

    if (!userId || !tokenValue) {
      return NextResponse.json({ message: 'userId and token query parameters are required.' }, { status: 400 });
    }

    // 1. Delete the token from the tokengenerate table
    const { error: tokenDeleteError } = await supabase
      .from('tokengenerate')
      .delete()
      .eq('token', tokenValue);

    if (tokenDeleteError) {
      console.error(`Error deleting token ${tokenValue} from tokengenerate table:`, tokenDeleteError.message);
      return NextResponse.json({ message: `Failed to delete token: ${tokenDeleteError.message}` }, { status: 500 });
    }

    // 2. Update the users table to set the 'token' column to null and 'token_removed' to true for the user
    const { error: userUpdateError } = await supabase
      .from('users')
      .update({ token: null, token_removed: true }) // Set the token column to null and token_removed to true
      .eq('id', userId)
      .eq('token', tokenValue); // Ensure we only update if it matches the token being removed

    if (userUpdateError) {
      console.error(`Error updating token and token_removed status for user ${userId} in users table:`, userUpdateError.message);
      return NextResponse.json({ message: `Failed to unlink token from user: ${userUpdateError.message}` }, { status: 500 });
    }

    // 3. Send a Supabase broadcast event to the user's channel
    try {
      await supabase
        .channel('session_updates')
        .send({
          type: 'broadcast',
          event: 'token_expired', // Keep this event as it triggers client-side logout/undeploy
          payload: { userId: userId, reason: 'admin_removed_token' }
        });
      console.log(`[AdminTokenLinkRoute] Broadcasted token_expired for user ${userId} after admin deletion.`);
    } catch (broadcastEx: any) {
      console.error(`[AdminTokenLinkRoute] Exception during token_expired broadcast for user ${userId}:`, broadcastEx.message);
    }

    return NextResponse.json({ message: 'Token deleted and user unlinked successfully.' }, { status: 200 });

  } catch (error: unknown) {
    let errorMessage = 'An unexpected error occurred while deleting user token link.';
    if (error instanceof Error) {
      errorMessage = error.message;
    } else if (typeof error === 'string') {
      errorMessage = error;
    } else if (error && typeof (error as any).message === 'string') {
      errorMessage = (error as any).message;
    }
    console.error('Error in /api/admin/user-token-link DELETE route:', errorMessage, error);
    
    const errorPayload: { message: string; errorDetail?: string } = {
      message: 'Failed to delete user token link.',
      errorDetail: errorMessage 
    };
    return NextResponse.json(errorPayload, { status: 500 });
  }
}
