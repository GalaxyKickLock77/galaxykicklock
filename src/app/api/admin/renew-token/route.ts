import { NextRequest, NextResponse } from 'next/server';
import { validateAdminSession } from '@/lib/adminAuth';
import crypto from 'crypto'; // Import crypto module
import { SecureQueryBuilder } from '@/lib/secureDatabase'; // Import SecureQueryBuilder

// const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL; // No longer needed
// const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // No longer needed

// if (!supabaseUrl || !supabaseServiceRoleKey) { // Handled by SecureQueryBuilder
//   console.error('Supabase URL or Service Role Key is missing for /api/admin/renew-token. Check environment variables.');
// }

// Server-side token generation logic using crypto for security
const generateTokenString = (length: number = 16): string => {
  return crypto.randomBytes(Math.ceil(length * 3 / 4)).toString('base64url').slice(0, length);
};

export async function POST(request: NextRequest) {
  let queryBuilder: SecureQueryBuilder;
  try {
    queryBuilder = await SecureQueryBuilder.create('service');
    const adminSession = await validateAdminSession(request);
    if (!adminSession) {
      return NextResponse.json({ message: 'Admin authentication required.' }, { status: 401 });
    }

    const { userId, duration: selectedDuration } = await request.json();

    if (!userId || !selectedDuration) {
      return NextResponse.json({ message: 'userId and duration are required.' }, { status: 400 });
    }
    if (!['3month', '6month', '1year'].includes(selectedDuration)) {
        return NextResponse.json({ message: 'Invalid duration provided.' }, { status: 400 });
    }

    // 1. Check if the user already has an "InUse" token
    const { data: existingTokenData, error: fetchError } = await queryBuilder.secureSelect(
        'tokengenerate',
        ['token', 'expiresat'],
        { userid: userId, status: 'InUse' }, // Assuming 'InUse' means an active, non-expired token for this user.
        { single: true }
    );

    if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 means no 'InUse' token found, which is fine.
        console.error('Error fetching existing token:', fetchError.message);
        return NextResponse.json({ message: `Error checking for existing token: ${fetchError.message}` }, { status: 500 });
    }
    
    if (existingTokenData) { // An "InUse" token was found
        const expiresAt = new Date(existingTokenData.expiresat);
        const currentDate = new Date();
        // If this "InUse" token is somehow not expired, prevent renewal.
        // This scenario (InUse but not expired) should ideally not happen if status is managed correctly,
        // but this check adds robustness.
        if (currentDate < expiresAt) {
            return NextResponse.json({ message: 'User already has an active token (status InUse and not expired). Please delete the existing token before renewing.' }, { status: 409 });
        } else {
            // Token is 'InUse' but EXPIRED. Delete it before creating a new one.
            // This is more of a cleanup. If a token is expired, its status should ideally not be 'InUse'.
            // For safety, we delete it.
            console.log(`Found an expired 'InUse' token for user ${userId}. Deleting it before renewal.`);
            const { error: deleteOldInUseError } = await queryBuilder.secureDelete(
                'tokengenerate',
                { token: existingTokenData.token }
            );
            if (deleteOldInUseError) {
                console.error('Failed to delete expired "InUse" token during renew:', deleteOldInUseError.message);
                // Decide if this is critical. For now, proceed to create new one.
            }
        }
    }
    // If no 'InUse' token was found (PGRST116 or existingTokenData is null), we can proceed to create a new one.

    // 2. Generate and insert new token
    const newTokenString = generateTokenString();
    const createdAt = new Date().toISOString();
    const expiresAtDate = new Date();
    switch (selectedDuration) {
        case '3month': expiresAtDate.setMonth(expiresAtDate.getMonth() + 3); break;
        case '6month': expiresAtDate.setMonth(expiresAtDate.getMonth() + 6); break;
        case '1year': expiresAtDate.setFullYear(expiresAtDate.getFullYear() + 1); break;
    }

    const newTokenPayload = {
      token: newTokenString,
      createdat: createdAt,
      expiresat: expiresAtDate.toISOString(),
      duration: selectedDuration,
      status: 'InUse', // New renewed token is immediately InUse
      userid: userId,
    };

    const { data: insertedTokenArray, error: insertTokenError } = await queryBuilder.secureInsert(
      'tokengenerate',
      newTokenPayload,
      { returning: ['token', 'createdat', 'expiresat', 'duration', 'status', 'userid'] }
    );

    if (insertTokenError) {
      console.error('Error inserting new token for renew:', insertTokenError.message);
      return NextResponse.json({ message: 'Failed to insert new token during renewal.' }, { status: 500 });
    }

    const insertedToken = Array.isArray(insertedTokenArray) && insertedTokenArray.length > 0 ? insertedTokenArray[0] : null;

    if (!insertedToken) {
        console.error('Token insertion did not return expected data for renew.');
        return NextResponse.json({ message: 'Failed to insert new token during renewal (no data returned).' }, { status: 500 });
    }


    // 3. Update the users table with the new token and set token_removed to FALSE
    const { error: userUpdateError } = await queryBuilder.secureUpdate(
        'users',
        { token: newTokenString, token_removed: false },
        { id: userId }
    );

    if (userUpdateError) {
      console.error('Error updating user table with new token:', userUpdateError.message);
      return NextResponse.json({ message: 'Token generated and stored, but failed to update user record.' }, { status: 207 }); // Multi-Status
    }

    return NextResponse.json({ message: 'Token renewed successfully!', renewedToken: insertedToken }, { status: 200 });

  } catch (error: any) {
    console.error('Error in /api/admin/renew-token POST route:', error.message);
    const message = error.code === 'DB_ERROR' ? 'A database error occurred.' : error.message;
    return NextResponse.json({ message: `Failed to renew token. ${message}` }, { status: 500 });
  } finally {
    // queryBuilder's connection is managed internally.
  }
}
