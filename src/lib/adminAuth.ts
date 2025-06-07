import { NextRequest, NextResponse } from 'next/server';
// import { createClient, SupabaseClient } from '@supabase/supabase-js'; // No longer needed
import { SecureQueryBuilder } from '@/lib/secureDatabase'; // Import SecureQueryBuilder

export interface AdminSession {
  adminId: string;
  adminUsername: string;
}

// const supabaseUrl = process.env.SUPABASE_URL; // No longer needed
// const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // No longer needed

// if (!supabaseUrl) { // Handled by SecureQueryBuilder
//   console.error('Supabase URL is missing for adminAuth. Check environment variables.');
// }

/**
 * Validates the admin session details from cookies against the admin table.
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

  let queryBuilder: SecureQueryBuilder;
  try {
    queryBuilder = await SecureQueryBuilder.create('service');

    // Validate admin existence and session details directly against the 'admin' table
    const { data: adminUserRecord, error: adminUserError } = await queryBuilder.secureSelect(
      'admin',
      ['id', 'username', 'session_id', 'session_token', 'session_expires_at'],
      {
        id: adminId,
        username: adminUsername,
        session_id: adminSessionId,
        session_token: adminSessionToken
      },
      { single: true }
    );

    if (adminUserError || !adminUserRecord) {
      if (adminUserError && adminUserError.code !== 'PGRST116') { // PGRST116 is "not found"
        console.error('Admin session validation DB error:', adminUserError.message);
      } else {
        console.log('Admin session validation failed (admin user or session details not found/matched in admin table).');
      }
      return null;
    }

    // Check if session has expired
    const now = new Date();
    const sessionExpiresAt = new Date(adminUserRecord.session_expires_at);
    if (now > sessionExpiresAt) {
      console.log('Admin session expired for adminId:', adminId);
      // Optionally, clear expired session data from the admin table
      const { error: updateError } = await queryBuilder.secureUpdate(
        'admin',
        { session_id: null, session_token: null, session_expires_at: null },
        { id: adminId }
      );
      if (updateError) {
        console.error('Failed to clear expired admin session data:', updateError.message);
      }
      return null;
    }

    console.log('Admin session validated via DB for:', adminUserRecord.username);
    return { adminId: adminUserRecord.id.toString(), adminUsername: adminUserRecord.username };

  } catch (e: any) {
    console.error('Exception during admin session validation (DB):', e.message);
    return null;
  } finally {
    // queryBuilder's connection is managed internally by its methods.
  }
}
