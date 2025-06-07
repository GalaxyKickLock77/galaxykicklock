/**
 * SECURITY FIX: Session Management API
 * Allows users to view and manage their active sessions
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateEnhancedSession, getUserActiveSessions, forceLogoutAllSessions, checkSessionSecurity } from '@/lib/enhancedAuth';
import { secureSessionManager } from '@/lib/secureSessionManager';

/**
 * GET /api/auth/sessions - Get user's active sessions
 */
export async function GET(request: NextRequest) {
  const session = await validateEnhancedSession(request);
  
  if (!session) {
    return NextResponse.json({ message: 'Authentication required' }, { status: 401 });
  }

  try {
    // Get session statistics and security status
    const [sessionStats, securityCheck] = await Promise.all([
      secureSessionManager.getSessionStats(session.userId),
      checkSessionSecurity(session.userId)
    ]);

    return NextResponse.json({
      currentSession: {
        sessionId: session.secureSession?.sessionId || session.activeSessionId,
        securityLevel: session.sessionSecurityLevel,
        needsUpgrade: session.needsUpgrade,
        createdAt: session.secureSession?.createdAt,
        lastAccessedAt: session.secureSession?.lastAccessedAt,
        expiresAt: session.secureSession?.expiresAt,
        privilegeLevel: session.secureSession?.privilegeLevel || 'basic',
      },
      stats: {
        activeSessions: sessionStats.activeSessions,
        totalSessions: sessionStats.totalSessions,
        lastLoginAt: sessionStats.lastLoginAt,
        suspiciousActivity: sessionStats.suspiciousActivity,
      },
      security: securityCheck,
    });
  } catch (error: any) {
    console.error('Error fetching session information:', error.message);
    return NextResponse.json({ message: 'Failed to fetch session information' }, { status: 500 });
  }
}

/**
 * DELETE /api/auth/sessions - Logout from all sessions
 */
export async function DELETE(request: NextRequest) {
  const session = await validateEnhancedSession(request);
  
  if (!session) {
    return NextResponse.json({ message: 'Authentication required' }, { status: 401 });
  }

  try {
    // Force logout from all sessions
    await forceLogoutAllSessions(session.userId);

    const response = NextResponse.json({ 
      message: 'Successfully logged out from all sessions' 
    });

    // Clear current session cookies
    return secureSessionManager.clearSessionCookies(response);
  } catch (error: any) {
    console.error('Error logging out from all sessions:', error.message);
    return NextResponse.json({ message: 'Failed to logout from all sessions' }, { status: 500 });
  }
}

/**
 * POST /api/auth/sessions/rotate - Manually rotate current session
 */
export async function POST(request: NextRequest) {
  const session = await validateEnhancedSession(request);
  
  if (!session) {
    return NextResponse.json({ message: 'Authentication required' }, { status: 401 });
  }

  if (!session.secureSession) {
    return NextResponse.json({ 
      message: 'Session rotation only available for secure sessions' 
    }, { status: 400 });
  }

  try {
    // Rotate the current session
    const rotatedSession = await secureSessionManager.rotateSession(session.secureSession.sessionId);

    const response = NextResponse.json({
      message: 'Session rotated successfully',
      newSessionId: rotatedSession.sessionId,
    });

    // Set new session cookies
    return secureSessionManager.setSessionCookies(response, rotatedSession);
  } catch (error: any) {
    console.error('Error rotating session:', error.message);
    return NextResponse.json({ message: 'Failed to rotate session' }, { status: 500 });
  }
}
