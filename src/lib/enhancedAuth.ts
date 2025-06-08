/**
 * SECURITY FIX: Enhanced Authentication System
 * Integrates secure session management with existing authentication
 */

import { NextRequest, NextResponse } from 'next/server';
import { secureSessionManager, SecureSessionData } from './secureSessionManager';
import { validateSession as legacyValidateSession, UserSession } from './auth';
import { validateAdminSession as legacyValidateAdminSession, AdminSession } from './adminAuth';

export interface EnhancedUserSession extends UserSession {
  secureSession?: SecureSessionData;
  sessionSecurityLevel: 'legacy' | 'secure';
  needsUpgrade: boolean;
}

export interface EnhancedAdminSession extends AdminSession {
  secureSession?: SecureSessionData;
  sessionSecurityLevel: 'legacy' | 'secure';
  needsUpgrade: boolean;
}

/**
 * SECURITY FIX: Enhanced session validation with backward compatibility
 */
export async function validateEnhancedSession(request: NextRequest): Promise<EnhancedUserSession | null> {
  // First, try to validate using the new secure session system
  const secureValidation = await secureSessionManager.validateSession(request);
  
  if (secureValidation.isValid && secureValidation.session) {
    const session = secureValidation.session;
    
    // Check if session needs rotation
    if (secureValidation.needsRotation) {
      try {
        const rotatedSession = await secureSessionManager.rotateSession(session.sessionId);
        return {
          userId: rotatedSession.userId,
          username: rotatedSession.username,
          deployTimestamp: null,
          activeFormNumber: null,
          activeRunId: null,
          token: null,
          tokenExpiresAt: null,
          lastLogout: null,
          tokenRemoved: null,
          activeSessionId: rotatedSession.sessionId,
          secureSession: rotatedSession,
          sessionSecurityLevel: 'secure',
          needsUpgrade: false,
        };
      } catch (error) {
        console.error('Session rotation failed:', error);
        // Fall back to current session if rotation fails
      }
    }
    
    return {
      userId: session.userId,
      username: session.username,
      deployTimestamp: null,
      activeFormNumber: null,
      activeRunId: null,
      token: null,
      tokenExpiresAt: null,
      lastLogout: null,
      tokenRemoved: null,
      activeSessionId: session.sessionId,
      secureSession: session,
      sessionSecurityLevel: 'secure',
      needsUpgrade: false,
    };
  }
  
  // Fall back to legacy session validation for backward compatibility
  const legacySession = await legacyValidateSession(request);
  
  if (legacySession) {
    return {
      ...legacySession,
      sessionSecurityLevel: 'legacy',
      needsUpgrade: true,
    };
  }
  
  return null;
}

/**
 * SECURITY FIX: Enhanced admin session validation
 */
export async function validateEnhancedAdminSession(request: NextRequest): Promise<EnhancedAdminSession | null> {
  // First, try to validate using the new secure session system
  const secureValidation = await secureSessionManager.validateSession(request);
  
  if (secureValidation.isValid && secureValidation.session && secureValidation.session.userType === 'admin') {
    const session = secureValidation.session;
    
    // Check if session needs rotation
    if (secureValidation.needsRotation) {
      try {
        const rotatedSession = await secureSessionManager.rotateSession(session.sessionId);
        return {
          adminId: rotatedSession.userId,
          adminUsername: rotatedSession.username,
          secureSession: rotatedSession,
          sessionSecurityLevel: 'secure',
          needsUpgrade: false,
        };
      } catch (error) {
        console.error('Admin session rotation failed:', error);
      }
    }
    
    return {
      adminId: session.userId,
      adminUsername: session.username,
      secureSession: session,
      sessionSecurityLevel: 'secure',
      needsUpgrade: false,
    };
  }
  
  // Fall back to legacy admin session validation
  const legacyAdminSession = await legacyValidateAdminSession(request);
  
  if (legacyAdminSession) {
    return {
      ...legacyAdminSession,
      sessionSecurityLevel: 'legacy',
      needsUpgrade: true,
    };
  }
  
  return null;
}

/**
 * SECURITY FIX: Upgrades legacy session to secure session
 */
export async function upgradeToSecureSession(
  legacySession: UserSession | AdminSession,
  request: NextRequest,
  userType: 'user' | 'admin'
): Promise<SecureSessionData> {
  const privilegeLevel = userType === 'admin' ? 'admin' : 'basic';
  
  if ('userId' in legacySession) {
    // User session
    return await secureSessionManager.createSession(
      legacySession.userId,
      legacySession.username,
      'user',
      privilegeLevel,
      request
    );
  } else {
    // Admin session
    return await secureSessionManager.createSession(
      legacySession.adminId,
      legacySession.adminUsername,
      'admin',
      privilegeLevel,
      request
    );
  }
}

/**
 * SECURITY FIX: Handles privilege escalation with session rotation
 */
export async function escalateSessionPrivileges(
  sessionId: string,
  newPrivilegeLevel: 'elevated' | 'admin'
): Promise<SecureSessionData> {
  return await secureSessionManager.escalatePrivileges(sessionId, newPrivilegeLevel);
}

/**
 * SECURITY FIX: Creates secure login response with session cookies
 */
export function createSecureLoginResponse(
  sessionData: SecureSessionData,
  responseData: any = { message: 'Login successful' }
): NextResponse {
  const response = NextResponse.json(responseData);
  return secureSessionManager.setSessionCookies(response, sessionData);
}

/**
 * SECURITY FIX: Creates secure logout response clearing all session data
 */
export async function createSecureLogoutResponse(
  sessionId?: string,
  responseData: any = { message: 'Logout successful' }
): Promise<NextResponse> {
  const response = NextResponse.json(responseData);
  
  if (sessionId) {
    await secureSessionManager.invalidateSession(sessionId);
  }
  
  return secureSessionManager.clearSessionCookies(response);
}

/**
 * SECURITY FIX: Middleware wrapper for secure session validation
 */
export function withSecureSession(
  handler: (request: NextRequest, session: EnhancedUserSession) => Promise<NextResponse>
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    const session = await validateEnhancedSession(request);
    
    if (!session) {
      return NextResponse.json({ message: 'Authentication required' }, { status: 401 });
    }
    
    // If session needs upgrade, attempt to upgrade it
    if (session.needsUpgrade && session.sessionSecurityLevel === 'legacy') {
      try {
        const secureSession = await upgradeToSecureSession(session, request, 'user');
        session.secureSession = secureSession;
        session.sessionSecurityLevel = 'secure';
        session.needsUpgrade = false;
        
        // Return response with new secure session cookies
        const response = await handler(request, session);
        return secureSessionManager.setSessionCookies(response, secureSession);
      } catch (error) {
        console.error('Session upgrade failed:', error);
        // Continue with legacy session if upgrade fails
      }
    }
    
    return handler(request, session);
  };
}

/**
 * SECURITY FIX: Admin middleware wrapper for secure session validation
 */
export function withSecureAdminSession(
  handler: (request: NextRequest, session: EnhancedAdminSession) => Promise<NextResponse>
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    const session = await validateEnhancedAdminSession(request);
    
    if (!session) {
      return NextResponse.json({ message: 'Admin authentication required' }, { status: 401 });
    }
    
    // If session needs upgrade, attempt to upgrade it
    if (session.needsUpgrade && session.sessionSecurityLevel === 'legacy') {
      try {
        const secureSession = await upgradeToSecureSession(session, request, 'admin');
        session.secureSession = secureSession;
        session.sessionSecurityLevel = 'secure';
        session.needsUpgrade = false;
        
        // Return response with new secure session cookies
        const response = await handler(request, session);
        return secureSessionManager.setSessionCookies(response, secureSession);
      } catch (error) {
        console.error('Admin session upgrade failed:', error);
        // Continue with legacy session if upgrade fails
      }
    }
    
    return handler(request, session);
  };
}

/**
 * SECURITY FIX: Session monitoring and security alerts
 */
export async function checkSessionSecurity(userId: string): Promise<{
  isSecure: boolean;
  alerts: string[];
  recommendations: string[];
}> {
  const stats = await secureSessionManager.getSessionStats(userId);
  const alerts: string[] = [];
  const recommendations: string[] = [];
  
  if (stats.suspiciousActivity) {
    alerts.push('Suspicious session activity detected');
    recommendations.push('Review recent login activity and consider changing password');
  }
  
  if (stats.activeSessions > 3) {
    alerts.push(`Multiple active sessions detected (${stats.activeSessions})`);
    recommendations.push('Sign out from unused devices');
  }
  
  const isSecure = alerts.length === 0;
  
  return {
    isSecure,
    alerts,
    recommendations,
  };
}

/**
 * SECURITY FIX: Force logout all sessions for a user
 */
export async function forceLogoutAllSessions(userId: string): Promise<void> {
  await secureSessionManager.invalidateUserSessions(userId);
}

/**
 * SECURITY FIX: Get active sessions for a user
 */
export async function getUserActiveSessions(userId: string): Promise<{
  count: number;
  sessions: Array<{
    sessionId: string;
    createdAt: Date;
    lastAccessedAt: Date;
    ipAddress?: string;
    userAgent?: string;
  }>;
}> {
  const stats = await secureSessionManager.getSessionStats(userId);
  
  return {
    count: stats.activeSessions,
    sessions: [], // Implementation would fetch actual session details
  };
}
