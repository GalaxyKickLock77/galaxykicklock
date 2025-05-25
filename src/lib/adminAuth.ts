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
  const adminSessionTokenCookie = request.cookies.get('adminSessionToken'); // New: Get session token

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
    // Validate admin existence and session details against admin_sessions table
    const { data: adminSessionRecord, error: sessionError } = await supabaseServiceAdmin
      .from('admin_sessions')
      .select('admin_id, session_id, session_token, expires_at')
      .eq('admin_id', adminId)
      .eq('session_id', adminSessionId)
      .eq('session_token', adminSessionToken)
      .single();

    if (sessionError || !adminSessionRecord) {
      console.error('Admin session validation failed (session record not found or DB error):', sessionError?.message);
      return null;
    }

    // Check if session has expired
    const now = new Date();
    const expiresAt = new Date(adminSessionRecord.expires_at);
    if (now > expiresAt) {
      console.log('Admin session expired for adminId:', adminId);
      // Optionally, delete the expired session from the DB here
      await supabaseServiceAdmin.from('admin_sessions').delete().eq('session_id', adminSessionId);
      return null;
    }

    // Additionally, verify the admin user still exists in the 'admin' table
    const { data: adminUserRecord, error: adminUserError } = await supabaseServiceAdmin
      .from('admin')
      .select('id, username')
      .eq('id', adminId)
      .eq('username', adminUsername)
      .single();

    if (adminUserError || !adminUserRecord) {
      console.error('Admin session validation failed (admin user not found in admin table):', adminUserError?.message);
      // If the user record is gone but session exists, invalidate the session
      await supabaseServiceAdmin.from('admin_sessions').delete().eq('session_id', adminSessionId);
      return null;
    }

    console.log('Admin session validated via DB for:', adminUserRecord.username);
    return { adminId: adminUserRecord.id.toString(), adminUsername: adminUserRecord.username };

  } catch (e: any) {
    console.error('Exception during admin session validation (DB):', e.message);
    return null;
  }
}
