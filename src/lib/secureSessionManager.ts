/**
 * SECURITY FIX: Secure Session Management System
 * Addresses session fixation, privilege escalation, and secure storage issues
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { securityCrypto } from './securityUtils';

// Session security configuration
const SESSION_CONFIG = {
  // Session token configuration
  TOKEN_LENGTH: 64, // 512 bits of entropy
  SESSION_ID_LENGTH: 32, // 256 bits of entropy
  
  // Session duration (in milliseconds)
  USER_SESSION_DURATION: 24 * 60 * 60 * 1000, // 24 hours
  ADMIN_SESSION_DURATION: 8 * 60 * 60 * 1000, // 8 hours (shorter for admin)
  REMEMBER_ME_DURATION: 30 * 24 * 60 * 60 * 1000, // 30 days
  
  // Session rotation thresholds
  ROTATION_INTERVAL: 60 * 60 * 1000, // Rotate every hour
  PRIVILEGE_ESCALATION_ROTATION: true, // Always rotate on privilege change
  
  // Cookie security settings
  COOKIE_OPTIONS: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    path: '/',
  },
  
  // Session storage encryption
  ENCRYPTION_ENABLED: true,
  SESSION_SECRET: process.env.SESSION_SECRET || 'fallback-session-secret-change-in-production',
};

export interface SecureSessionData {
  sessionId: string;
  sessionToken: string;
  userId: string;
  username: string;
  userType: 'user' | 'admin';
  createdAt: Date;
  lastAccessedAt: Date;
  expiresAt: Date;
  ipAddress?: string;
  userAgent?: string;
  privilegeLevel: 'basic' | 'elevated' | 'admin';
  isRotated: boolean;
  rotationCount: number;
  fingerprint: string; // Browser fingerprint for additional security
}

export interface SessionValidationResult {
  isValid: boolean;
  session?: SecureSessionData;
  needsRotation?: boolean;
  error?: string;
}

/**
 * SECURITY FIX: Secure Session Manager Class
 */
export class SecureSessionManager {
  private supabase: SupabaseClient;

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseServiceRoleKey) {
      throw new Error('Supabase configuration missing for secure session management');
    }
    
    this.supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
  }

  /**
   * SECURITY FIX: Generates cryptographically secure session tokens
   */
  private generateSecureToken(length: number = SESSION_CONFIG.TOKEN_LENGTH): string {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * SECURITY FIX: Generates secure session ID
   */
  private generateSessionId(): string {
    return crypto.randomBytes(SESSION_CONFIG.SESSION_ID_LENGTH).toString('hex');
  }

  /**
   * SECURITY FIX: Creates browser fingerprint for session binding
   */
  private createBrowserFingerprint(request: NextRequest): string {
    const userAgent = request.headers.get('user-agent') || '';
    const acceptLanguage = request.headers.get('accept-language') || '';
    const acceptEncoding = request.headers.get('accept-encoding') || '';
    
    const fingerprint = `${userAgent}|${acceptLanguage}|${acceptEncoding}`;
    return securityCrypto.hash(fingerprint);
  }

  /**
   * SECURITY FIX: Encrypts session data for secure storage
   */
  private encryptSessionData(data: any): string {
    if (!SESSION_CONFIG.ENCRYPTION_ENABLED) {
      return JSON.stringify(data);
    }
    
    try {
      return securityCrypto.encrypt(JSON.stringify(data));
    } catch (error) {
      throw new Error('Session data encryption failed');
    }
  }

  /**
   * SECURITY FIX: Decrypts session data from secure storage
   */
  private decryptSessionData(encryptedData: string): any {
    if (!SESSION_CONFIG.ENCRYPTION_ENABLED) {
      return JSON.parse(encryptedData);
    }
    
    try {
      return JSON.parse(securityCrypto.decrypt(encryptedData));
    } catch (error) {
      throw new Error('Session data decryption failed');
    }
  }

  /**
   * SECURITY FIX: Creates a new secure session
   */
  async createSession(
    userId: string,
    username: string,
    userType: 'user' | 'admin',
    privilegeLevel: 'basic' | 'elevated' | 'admin',
    request: NextRequest,
    rememberMe: boolean = false
  ): Promise<SecureSessionData> {
    const now = new Date();
    const sessionId = this.generateSessionId();
    const sessionToken = this.generateSecureToken();
    const fingerprint = this.createBrowserFingerprint(request);
    
    // Determine session duration
    let duration = SESSION_CONFIG.USER_SESSION_DURATION;
    if (userType === 'admin') {
      duration = SESSION_CONFIG.ADMIN_SESSION_DURATION;
    } else if (rememberMe) {
      duration = SESSION_CONFIG.REMEMBER_ME_DURATION;
    }
    
    const sessionData: SecureSessionData = {
      sessionId,
      sessionToken,
      userId,
      username,
      userType,
      createdAt: now,
      lastAccessedAt: now,
      expiresAt: new Date(now.getTime() + duration),
      ipAddress: this.getClientIP(request),
      userAgent: request.headers.get('user-agent') || undefined,
      privilegeLevel,
      isRotated: false,
      rotationCount: 0,
      fingerprint,
    };

    // Store encrypted session in database
    const encryptedData = this.encryptSessionData(sessionData);
    
    const { error } = await this.supabase
      .from('secure_sessions')
      .insert({
        session_id: sessionId,
        user_id: userId,
        user_type: userType,
        session_data: encryptedData,
        expires_at: sessionData.expiresAt.toISOString(),
        created_at: now.toISOString(),
        last_accessed_at: now.toISOString(),
        ip_address: sessionData.ipAddress,
        user_agent: sessionData.userAgent,
        fingerprint: fingerprint,
        privilege_level: privilegeLevel,
      });

    if (error) {
      throw new Error(`Failed to create secure session: ${error.message}`);
    }

    // SECURITY FIX: Invalidate any existing sessions for this user (prevent session fixation)
    await this.invalidateUserSessions(userId, sessionId);

    return sessionData;
  }

  /**
   * SECURITY FIX: Validates and retrieves session data
   */
  async validateSession(request: NextRequest): Promise<SessionValidationResult> {
    const sessionId = request.cookies.get('secureSessionId')?.value;
    const sessionToken = request.cookies.get('secureSessionToken')?.value;

    if (!sessionId || !sessionToken) {
      return { isValid: false, error: 'Missing session credentials' };
    }

    try {
      // Retrieve session from database
      const { data: sessionRecord, error } = await this.supabase
        .from('secure_sessions')
        .select('*')
        .eq('session_id', sessionId)
        .eq('is_active', true)
        .single();

      if (error || !sessionRecord) {
        return { isValid: false, error: 'Session not found' };
      }

      // Decrypt session data
      const sessionData: SecureSessionData = this.decryptSessionData(sessionRecord.session_data);

      // Validate session token
      if (sessionData.sessionToken !== sessionToken) {
        return { isValid: false, error: 'Invalid session token' };
      }

      // Check expiration
      if (new Date() > new Date(sessionData.expiresAt)) {
        await this.invalidateSession(sessionId);
        return { isValid: false, error: 'Session expired' };
      }

      // SECURITY FIX: Validate browser fingerprint (prevent session hijacking)
      const currentFingerprint = this.createBrowserFingerprint(request);
      if (sessionData.fingerprint !== currentFingerprint) {
        await this.invalidateSession(sessionId);
        return { isValid: false, error: 'Session security validation failed' };
      }

      // Check if session needs rotation
      const needsRotation = this.shouldRotateSession(sessionData);

      // Update last accessed time
      await this.updateSessionAccess(sessionId);

      return {
        isValid: true,
        session: sessionData,
        needsRotation,
      };
    } catch (error: any) {
      return { isValid: false, error: `Session validation failed: ${error.message}` };
    }
  }

  /**
   * SECURITY FIX: Rotates session tokens (prevents session fixation)
   */
  async rotateSession(sessionId: string, privilegeEscalation: boolean = false): Promise<SecureSessionData> {
    const { data: sessionRecord, error } = await this.supabase
      .from('secure_sessions')
      .select('*')
      .eq('session_id', sessionId)
      .eq('is_active', true)
      .single();

    if (error || !sessionRecord) {
      throw new Error('Session not found for rotation');
    }

    const oldSessionData: SecureSessionData = this.decryptSessionData(sessionRecord.session_data);
    
    // Generate new session credentials
    const newSessionId = this.generateSessionId();
    const newSessionToken = this.generateSecureToken();
    const now = new Date();

    // SECURITY FIX: Extend session duration on privilege escalation
    let newExpiresAt = oldSessionData.expiresAt;
    if (privilegeEscalation) {
      const duration = oldSessionData.userType === 'admin' 
        ? SESSION_CONFIG.ADMIN_SESSION_DURATION 
        : SESSION_CONFIG.USER_SESSION_DURATION;
      newExpiresAt = new Date(now.getTime() + duration);
    }

    const newSessionData: SecureSessionData = {
      ...oldSessionData,
      sessionId: newSessionId,
      sessionToken: newSessionToken,
      lastAccessedAt: now,
      expiresAt: newExpiresAt,
      isRotated: true,
      rotationCount: oldSessionData.rotationCount + 1,
    };

    // Store new session
    const encryptedData = this.encryptSessionData(newSessionData);
    
    const { error: insertError } = await this.supabase
      .from('secure_sessions')
      .insert({
        session_id: newSessionId,
        user_id: oldSessionData.userId,
        user_type: oldSessionData.userType,
        session_data: encryptedData,
        expires_at: newSessionData.expiresAt.toISOString(),
        created_at: oldSessionData.createdAt.toISOString(),
        last_accessed_at: now.toISOString(),
        ip_address: oldSessionData.ipAddress,
        user_agent: oldSessionData.userAgent,
        fingerprint: oldSessionData.fingerprint,
        privilege_level: oldSessionData.privilegeLevel,
        rotated_from: sessionId,
      });

    if (insertError) {
      throw new Error(`Failed to create rotated session: ${insertError.message}`);
    }

    // Invalidate old session
    await this.invalidateSession(sessionId);

    return newSessionData;
  }

  /**
   * SECURITY FIX: Handles privilege escalation with session rotation
   */
  async escalatePrivileges(
    sessionId: string, 
    newPrivilegeLevel: 'elevated' | 'admin'
  ): Promise<SecureSessionData> {
    // SECURITY FIX: Always rotate session on privilege escalation
    const rotatedSession = await this.rotateSession(sessionId, true);
    
    // Update privilege level
    rotatedSession.privilegeLevel = newPrivilegeLevel;
    
    // Update in database
    const encryptedData = this.encryptSessionData(rotatedSession);
    
    await this.supabase
      .from('secure_sessions')
      .update({
        session_data: encryptedData,
        privilege_level: newPrivilegeLevel,
      })
      .eq('session_id', rotatedSession.sessionId);

    return rotatedSession;
  }

  /**
   * SECURITY FIX: Invalidates a specific session
   */
  async invalidateSession(sessionId: string): Promise<void> {
    await this.supabase
      .from('secure_sessions')
      .update({ is_active: false, invalidated_at: new Date().toISOString() })
      .eq('session_id', sessionId);
  }

  /**
   * SECURITY FIX: Invalidates all sessions for a user (except current)
   */
  async invalidateUserSessions(userId: string, exceptSessionId?: string): Promise<void> {
    let query = this.supabase
      .from('secure_sessions')
      .update({ is_active: false, invalidated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('is_active', true);

    if (exceptSessionId) {
      query = query.neq('session_id', exceptSessionId);
    }

    await query;
  }

  /**
   * SECURITY FIX: Sets secure session cookies
   */
  setSessionCookies(response: NextResponse, sessionData: SecureSessionData): NextResponse {
    const cookieOptions = {
      ...SESSION_CONFIG.COOKIE_OPTIONS,
      expires: sessionData.expiresAt,
    };

    response.cookies.set('secureSessionId', sessionData.sessionId, cookieOptions);
    response.cookies.set('secureSessionToken', sessionData.sessionToken, cookieOptions);
    response.cookies.set('userId', sessionData.userId, cookieOptions);
    response.cookies.set('username', sessionData.username, cookieOptions);
    response.cookies.set('userType', sessionData.userType, cookieOptions);
    response.cookies.set('privilegeLevel', sessionData.privilegeLevel, cookieOptions);

    return response;
  }

  /**
   * SECURITY FIX: Clears session cookies
   */
  clearSessionCookies(response: NextResponse): NextResponse {
    const clearOptions = {
      ...SESSION_CONFIG.COOKIE_OPTIONS,
      expires: new Date(0),
    };

    response.cookies.set('secureSessionId', '', clearOptions);
    response.cookies.set('secureSessionToken', '', clearOptions);
    response.cookies.set('userId', '', clearOptions);
    response.cookies.set('username', '', clearOptions);
    response.cookies.set('userType', '', clearOptions);
    response.cookies.set('privilegeLevel', '', clearOptions);

    return response;
  }

  /**
   * SECURITY FIX: Determines if session should be rotated
   */
  private shouldRotateSession(sessionData: SecureSessionData): boolean {
    const now = new Date();
    const lastAccessed = new Date(sessionData.lastAccessedAt);
    const timeSinceLastAccess = now.getTime() - lastAccessed.getTime();

    return timeSinceLastAccess > SESSION_CONFIG.ROTATION_INTERVAL;
  }

  /**
   * Updates session last accessed time
   */
  private async updateSessionAccess(sessionId: string): Promise<void> {
    await this.supabase
      .from('secure_sessions')
      .update({ last_accessed_at: new Date().toISOString() })
      .eq('session_id', sessionId);
  }

  /**
   * Extracts client IP address
   */
  private getClientIP(request: NextRequest): string | undefined {
    const forwarded = request.headers.get('x-forwarded-for');
    const realIP = request.headers.get('x-real-ip');
    
    if (forwarded) {
      return forwarded.split(',')[0].trim();
    }
    
    return realIP || undefined;
  }

  /**
   * SECURITY FIX: Gets session statistics for monitoring
   */
  async getSessionStats(userId: string): Promise<{
    activeSessions: number;
    totalSessions: number;
    lastLoginAt: Date | null;
    suspiciousActivity: boolean;
  }> {
    const { data: sessions } = await this.supabase
      .from('secure_sessions')
      .select('*')
      .eq('user_id', userId);

    if (!sessions) {
      return {
        activeSessions: 0,
        totalSessions: 0,
        lastLoginAt: null,
        suspiciousActivity: false,
      };
    }

    const activeSessions = sessions.filter(s => s.is_active).length;
    const totalSessions = sessions.length;
    const lastLoginAt = sessions.length > 0 
      ? new Date(Math.max(...sessions.map(s => new Date(s.created_at).getTime())))
      : null;

    // Check for suspicious activity (multiple active sessions, rapid session creation)
    const recentSessions = sessions.filter(s => {
      const createdAt = new Date(s.created_at);
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      return createdAt > oneHourAgo;
    });

    const suspiciousActivity = activeSessions > 3 || recentSessions.length > 5;

    return {
      activeSessions,
      totalSessions,
      lastLoginAt,
      suspiciousActivity,
    };
  }
}

// Export singleton instance
export const secureSessionManager = new SecureSessionManager();
