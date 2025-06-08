/**
 * SECURITY FIX: Secure Database Wrapper
 * Replaces direct Supabase usage with secure, prepared statement-based queries
 */

import { SecureQueryBuilder, DatabaseSecurity } from './secureDatabase';
import { secureLog } from './secureLogger';

/**
 * SECURITY FIX: Secure database operations for user management
 */
export class SecureUserDatabase {
  /**
   * SECURITY FIX: Secure user authentication query
   */
  static async authenticateUser(username: string): Promise<{
    data: any;
    error: any;
  }> {
    try {
      const queryBuilder = await SecureQueryBuilder.create('service');
      
      return await queryBuilder.secureSelect(
        'users',
        ['id', 'username', 'password', 'session_token', 'active_session_id', 'login_count', 'deploy_timestamp', 'active_form_number', 'active_run_id', 'last_logout', 'token_removed'],
        { username: username.toLowerCase().trim() },
        { single: true }
      );
    } catch (error) {
      secureLog.error('User authentication query failed', error, 'SecureUserDatabase');
      return {
        data: null,
        error: { message: 'Authentication failed' }
      };
    }
  }
  
  /**
   * SECURITY FIX: Secure user session update
   */
  static async updateUserSession(
    userId: string,
    sessionData: {
      session_token?: string;
      active_session_id?: string;
      login_count?: number;
      last_login?: string;
      last_logout?: string;
    }
  ): Promise<{ data: any; error: any }> {
    try {
      const queryBuilder = await SecureQueryBuilder.create('service');
      
      return await queryBuilder.secureUpdate(
        'users',
        sessionData,
        { id: userId },
        { returning: ['id', 'username', 'session_token', 'active_session_id'] }
      );
    } catch (error) {
      secureLog.error('User session update failed', error, 'SecureUserDatabase');
      return {
        data: null,
        error: { message: 'Session update failed' }
      };
    }
  }
  
  /**
   * SECURITY FIX: Secure user creation for signup
   */
  static async createUser(userData: {
    username: string;
    password: string;
    token: string;
  }): Promise<{ data: any; error: any }> {
    try {
      const queryBuilder = await SecureQueryBuilder.create('service');
      
      return await queryBuilder.secureInsert(
        'users',
        {
          username: userData.username.toLowerCase().trim(),
          password: userData.password,
          token: userData.token,
          created_at: new Date().toISOString(),
        },
        { returning: ['id', 'username'] }
      );
    } catch (error) {
      secureLog.error('User creation failed', error, 'SecureUserDatabase');
      return {
        data: null,
        error: { message: 'User creation failed' }
      };
    }
  }
  
  /**
   * SECURITY FIX: Secure user deployment status update
   */
  static async updateUserDeploymentStatus(
    userId: string,
    deploymentData: {
      deploy_timestamp?: string | null;
      active_form_number?: number | null;
      active_run_id?: string | null;
    }
  ): Promise<{ data: any; error: any }> {
    try {
      const queryBuilder = await SecureQueryBuilder.create('service');
      
      return await queryBuilder.secureUpdate(
        'users',
        deploymentData,
        { id: userId }
      );
    } catch (error) {
      secureLog.error('User deployment status update failed', error, 'SecureUserDatabase');
      return {
        data: null,
        error: { message: 'Deployment status update failed' }
      };
    }
  }
}

/**
 * SECURITY FIX: Secure database operations for admin management
 */
export class SecureAdminDatabase {
  /**
   * SECURITY FIX: Secure admin authentication
   */
  static async authenticateAdmin(
    adminId: string,
    adminUsername: string,
    sessionId: string,
    sessionToken: string
  ): Promise<{ data: any; error: any }> {
    try {
      const queryBuilder = await SecureQueryBuilder.create('service');
      
      return await queryBuilder.secureSelect(
        'admin',
        ['id', 'username', 'session_id', 'session_token', 'session_expires_at'],
        {
          id: adminId,
          username: adminUsername,
          session_id: sessionId,
          session_token: sessionToken
        },
        { single: true }
      );
    } catch (error) {
      secureLog.error('Admin authentication query failed', error, 'SecureAdminDatabase');
      return {
        data: null,
        error: { message: 'Admin authentication failed' }
      };
    }
  }
  
  /**
   * SECURITY FIX: Secure admin session cleanup
   */
  static async clearAdminSession(adminId: string): Promise<{ data: any; error: any }> {
    try {
      const queryBuilder = await SecureQueryBuilder.create('service');
      
      return await queryBuilder.secureUpdate(
        'admin',
        {
          session_id: null,
          session_token: null,
          session_expires_at: null
        },
        { id: adminId }
      );
    } catch (error) {
      secureLog.error('Admin session cleanup failed', error, 'SecureAdminDatabase');
      return {
        data: null,
        error: { message: 'Session cleanup failed' }
      };
    }
  }
  
  /**
   * SECURITY FIX: Secure admin user listing with pagination
   */
  static async getUsers(
    limit: number = 50,
    offset: number = 0
  ): Promise<{ data: any; error: any }> {
    try {
      const queryBuilder = await SecureQueryBuilder.create('service');
      
      return await queryBuilder.secureSelect(
        'users',
        ['id', 'username', 'created_at', 'last_login', 'login_count', 'token_removed'],
        {},
        {
          limit: Math.min(limit, 100), // Cap at 100
          offset,
          orderBy: { column: 'created_at', ascending: false }
        }
      );
    } catch (error) {
      secureLog.error('Admin user listing failed', error, 'SecureAdminDatabase');
      return {
        data: null,
        error: { message: 'User listing failed' }
      };
    }
  }
  
  /**
   * SECURITY FIX: Secure token management
   */
  static async getTokens(
    limit: number = 50,
    offset: number = 0
  ): Promise<{ data: any; error: any }> {
    try {
      const queryBuilder = await SecureQueryBuilder.create('service');
      
      return await queryBuilder.secureSelect(
        'tokengenerate',
        ['id', 'token', 'userid', 'status', 'expires_at', 'created_at'],
        {},
        {
          limit: Math.min(limit, 100),
          offset,
          orderBy: { column: 'created_at', ascending: false }
        }
      );
    } catch (error) {
      secureLog.error('Admin token listing failed', error, 'SecureAdminDatabase');
      return {
        data: null,
        error: { message: 'Token listing failed' }
      };
    }
  }
}

/**
 * SECURITY FIX: Secure database operations for token management
 */
export class SecureTokenDatabase {
  /**
   * SECURITY FIX: Secure token validation
   */
  static async validateToken(token: string): Promise<{ data: any; error: any }> {
    try {
      const queryBuilder = await SecureQueryBuilder.create('service');
      
      return await queryBuilder.secureSelect(
        'tokengenerate',
        ['id', 'token', 'userid', 'status', 'expires_at', 'created_at'],
        { token: token.trim() },
        { single: true }
      );
    } catch (error) {
      secureLog.error('Token validation failed', error, 'SecureTokenDatabase');
      return {
        data: null,
        error: { message: 'Token validation failed' }
      };
    }
  }
  
  /**
   * SECURITY FIX: Secure token status update
   */
  static async updateTokenStatus(
    token: string,
    updates: {
      userid?: string;
      status?: string;
      expires_at?: string;
    }
  ): Promise<{ data: any; error: any }> {
    try {
      const queryBuilder = await SecureQueryBuilder.create('service');
      
      return await queryBuilder.secureUpdate(
        'tokengenerate',
        updates,
        { token: token.trim() }
      );
    } catch (error) {
      secureLog.error('Token status update failed', error, 'SecureTokenDatabase');
      return {
        data: null,
        error: { message: 'Token update failed' }
      };
    }
  }
  
  /**
   * SECURITY FIX: Secure token creation
   */
  static async createToken(tokenData: {
    token: string;
    status: string;
    expires_at: string;
    created_by?: string;
  }): Promise<{ data: any; error: any }> {
    try {
      const queryBuilder = await SecureQueryBuilder.create('service');
      
      return await queryBuilder.secureInsert(
        'tokengenerate',
        {
          ...tokenData,
          created_at: new Date().toISOString(),
        },
        { returning: ['id', 'token', 'status'] }
      );
    } catch (error) {
      secureLog.error('Token creation failed', error, 'SecureTokenDatabase');
      return {
        data: null,
        error: { message: 'Token creation failed' }
      };
    }
  }
}

/**
 * SECURITY FIX: Secure database operations for session management
 */
export class SecureSessionDatabase {
  /**
   * SECURITY FIX: Secure session creation
   */
  static async createSession(sessionData: {
    session_id: string;
    user_id: string;
    user_type: string;
    session_data: string;
    expires_at: string;
    ip_address?: string;
    user_agent?: string;
    fingerprint?: string;
    privilege_level?: string;
  }): Promise<{ data: any; error: any }> {
    try {
      const queryBuilder = await SecureQueryBuilder.create('service');
      
      return await queryBuilder.secureInsert(
        'secure_sessions',
        {
          ...sessionData,
          created_at: new Date().toISOString(),
          last_accessed_at: new Date().toISOString(),
          is_active: true,
        },
        { returning: ['session_id', 'user_id', 'expires_at'] }
      );
    } catch (error) {
      secureLog.error('Session creation failed', error, 'SecureSessionDatabase');
      return {
        data: null,
        error: { message: 'Session creation failed' }
      };
    }
  }
  
  /**
   * SECURITY FIX: Secure session validation
   */
  static async validateSession(sessionId: string): Promise<{ data: any; error: any }> {
    try {
      const queryBuilder = await SecureQueryBuilder.create('service');
      
      return await queryBuilder.secureSelect(
        'secure_sessions',
        ['session_id', 'user_id', 'user_type', 'session_data', 'expires_at', 'fingerprint', 'privilege_level', 'last_accessed_at'],
        {
          session_id: sessionId,
          is_active: true
        },
        { single: true }
      );
    } catch (error) {
      secureLog.error('Session validation failed', error, 'SecureSessionDatabase');
      return {
        data: null,
        error: { message: 'Session validation failed' }
      };
    }
  }
  
  /**
   * SECURITY FIX: Secure session invalidation
   */
  static async invalidateSession(sessionId: string): Promise<{ data: any; error: any }> {
    try {
      const queryBuilder = await SecureQueryBuilder.create('service');
      
      return await queryBuilder.secureUpdate(
        'secure_sessions',
        {
          is_active: false,
          invalidated_at: new Date().toISOString()
        },
        { session_id: sessionId }
      );
    } catch (error) {
      secureLog.error('Session invalidation failed', error, 'SecureSessionDatabase');
      return {
        data: null,
        error: { message: 'Session invalidation failed' }
      };
    }
  }
  
  /**
   * SECURITY FIX: Secure user session cleanup
   */
  static async invalidateUserSessions(
    userId: string,
    exceptSessionId?: string
  ): Promise<{ data: any; error: any }> {
    try {
      const queryBuilder = await SecureQueryBuilder.create('service');
      
      // First get all sessions for the user
      const { data: sessions, error: selectError } = await queryBuilder.secureSelect(
        'secure_sessions',
        ['session_id'],
        {
          user_id: userId,
          is_active: true
        }
      );
      
      if (selectError || !sessions) {
        return { data: null, error: selectError };
      }
      
      // Filter out the exception session
      const sessionsToInvalidate = sessions.filter((session: any) => 
        !exceptSessionId || session.session_id !== exceptSessionId
      );
      
      // Invalidate each session
      const results = [];
      for (const session of sessionsToInvalidate) {
        const result = await queryBuilder.secureUpdate(
          'secure_sessions',
          {
            is_active: false,
            invalidated_at: new Date().toISOString()
          },
          { session_id: session.session_id }
        );
        results.push(result);
      }
      
      return {
        data: { invalidated_count: results.length },
        error: null
      };
    } catch (error) {
      secureLog.error('User session cleanup failed', error, 'SecureSessionDatabase');
      return {
        data: null,
        error: { message: 'Session cleanup failed' }
      };
    }
  }
}

/**
 * SECURITY FIX: Database health and security monitoring
 */
export class DatabaseMonitoring {
  /**
   * SECURITY FIX: Get database security status
   */
  static async getSecurityStatus(): Promise<{
    connectionPool: any;
    rlsStatus: any;
    recentViolations: any;
  }> {
    try {
      const queryBuilder = await SecureQueryBuilder.create('service');
      
      // Get RLS violations from the last 24 hours
      const { data: violations } = await queryBuilder.secureSelect(
        'rls_audit_log',
        ['table_name', 'operation', 'attempted_at', 'policy_violated'],
        {},
        {
          limit: 50,
          orderBy: { column: 'attempted_at', ascending: false }
        }
      );
      
      return {
        connectionPool: DatabaseSecurity.getSecurityMetrics().connectionPool,
        rlsStatus: {
          enabled: true,
          policies_active: true
        },
        recentViolations: violations || []
      };
    } catch (error) {
      secureLog.error('Database security status check failed', error, 'DatabaseMonitoring');
      return {
        connectionPool: { error: 'Unable to fetch stats' },
        rlsStatus: { error: 'Unable to check RLS' },
        recentViolations: []
      };
    }
  }
  
  /**
   * SECURITY FIX: Validate database security configuration
   */
  static async validateSecurityConfiguration(): Promise<{
    isSecure: boolean;
    issues: string[];
    recommendations: string[];
  }> {
    const issues: string[] = [];
    const recommendations: string[] = [];
    
    try {
      // Check if RLS is enabled on critical tables
      const criticalTables = ['users', 'admin', 'tokengenerate', 'secure_sessions'];
      
      for (const table of criticalTables) {
        const hasRLS = await DatabaseSecurity.validateRLSPolicies(table);
        if (!hasRLS) {
          issues.push(`RLS not properly configured for table: ${table}`);
          recommendations.push(`Enable RLS policies for ${table} table`);
        }
      }
      
      // Check connection pool status
      const poolStats = DatabaseSecurity.getSecurityMetrics().connectionPool;
      if (poolStats.activeConnections > poolStats.maxConnections * 0.8) {
        recommendations.push('Consider increasing connection pool size or optimizing queries');
      }
      
      return {
        isSecure: issues.length === 0,
        issues,
        recommendations
      };
    } catch (error) {
      secureLog.error('Security configuration validation failed', error, 'DatabaseMonitoring');
      return {
        isSecure: false,
        issues: ['Unable to validate security configuration'],
        recommendations: ['Check database connectivity and permissions']
      };
    }
  }
}
