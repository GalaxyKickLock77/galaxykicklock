import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface AdminSession {
  adminId: string;
  adminUsername: string;
}

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  console.error('Supabase URL is missing for adminAuth. Check environment variables.');
}

/**
 * Validates the admin session details from cookies against the admin_sessions table.
 * 
 * Expects cookies:
 * - 'adminId'
 * - 'adminUsername'
 * - 'adminSessionId'
 * - 'adminSessionToken'
 * 
 * @param request The NextRequest object.
 * @returns The admin session object if valid, otherwise null.
 */
export async function validateAdminSession(request: NextRequest): Promise<AdminSession | null> {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    console.error('Supabase URL or Service Role Key is missing for admin session validation. Check environment variables.');
    return null;
  }

  const adminIdCookie = request.cookies.get('adminId');
  const adminUsernameCookie = request.cookies.get('adminUsername');
  const adminSessionIdCookie = request.cookies.get('adminSessionId');
  const adminSessionTokenCookie = request.cookies.get('adminSessionToken');

  if (!adminIdCookie?.value || !adminUsernameCookie?.value || !adminSessionIdCookie?.value || !adminSessionTokenCookie?.value) {
    console.log('Missing one or more admin session cookies (adminId, adminUsername, adminSessionId, adminSessionToken).');
    return null;
  }

  const adminId = adminIdCookie.value;
  const adminUsername = adminUsernameCookie.value;
  const adminSessionId = adminSessionIdCookie.value;
  const adminSessionToken = adminSessionTokenCookie.value;

  const supabaseServiceAdmin: SupabaseClient = createClient(supabaseUrl, supabaseServiceRoleKey);

  try {
    // Validate admin existence and session details directly against the 'admin' table
    const { data: adminUserRecord, error: adminUserError } = await supabaseServiceAdmin
      .from('admin')
      .select('id, username, session_id, session_token, session_expires_at') // Select session columns from admin table
      .eq('id', adminId)
      .eq('username', adminUsername)
      .eq('session_id', adminSessionId)
      .eq('session_token', adminSessionToken)
      .single();

    if (adminUserError || !adminUserRecord) {
      console.error('Admin session validation failed (admin user or session details not found/matched in admin table):', adminUserError?.message);
      return null;
    }

    // Check if session has expired
    const now = new Date();
    const sessionExpiresAt = new Date(adminUserRecord.session_expires_at); // Use session_expires_at
    if (now > sessionExpiresAt) {
      console.log('Admin session expired for adminId:', adminId);
      // Optionally, clear expired session data from the admin table
      await supabaseServiceAdmin.from('admin').update({ session_id: null, session_token: null, session_expires_at: null }).eq('id', adminId);
      return null;
    }

    console.log('Admin session validated via DB for:', adminUserRecord.username);
    return { adminId: adminUserRecord.id.toString(), adminUsername: adminUserRecord.username };

  } catch (e: any) {
    console.error('Exception during admin session validation (DB):', e.message);
    return null;
  }
}
