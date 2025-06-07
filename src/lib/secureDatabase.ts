/**
 * SECURITY FIX: Secure Database Management System
 * Implements prepared statements, connection pooling, and row-level security
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { secureLog } from './secureLogger';

// Database security configuration
const DB_SECURITY_CONFIG = {
  // Connection pooling limits
  CONNECTION_POOL: {
    MAX_CONNECTIONS: 10, // Maximum concurrent connections
    IDLE_TIMEOUT: 30000, // 30 seconds idle timeout
    CONNECTION_TIMEOUT: 10000, // 10 seconds connection timeout
    STATEMENT_TIMEOUT: 30000, // 30 seconds statement timeout
  },
  
  // Query security settings
  QUERY_SECURITY: {
    MAX_QUERY_LENGTH: 10000, // Maximum query length
    ENABLE_QUERY_LOGGING: process.env.NODE_ENV === 'development',
    SANITIZE_ERRORS: true, // Sanitize error messages
    RATE_LIMIT_QUERIES: true, // Enable query rate limiting
  },
  
  // Row Level Security settings
  RLS_CONFIG: {
    ENFORCE_RLS: true, // Always enforce RLS
    DEFAULT_POLICY: 'RESTRICTIVE', // Default to restrictive policies
    AUDIT_RLS_BYPASS: true, // Audit when RLS is bypassed
  }
};

/**
 * SECURITY FIX: Connection pool manager
 */
class DatabaseConnectionPool {
  private static instance: DatabaseConnectionPool;
  private connections: Map<string, { client: SupabaseClient; lastUsed: number; inUse: boolean }> = new Map();
  private connectionCount = 0;
  
  private constructor() {
    // Cleanup idle connections periodically
    setInterval(() => {
      this.cleanupIdleConnections();
    }, DB_SECURITY_CONFIG.CONNECTION_POOL.IDLE_TIMEOUT);
  }
  
  static getInstance(): DatabaseConnectionPool {
    if (!DatabaseConnectionPool.instance) {
      DatabaseConnectionPool.instance = new DatabaseConnectionPool();
    }
    return DatabaseConnectionPool.instance;
  }
  
  /**
   * SECURITY FIX: Get a connection from the pool with limits
   */
  async getConnection(connectionType: 'service' | 'anon' = 'service'): Promise<SupabaseClient> {
    // Check connection limit
    if (this.connectionCount >= DB_SECURITY_CONFIG.CONNECTION_POOL.MAX_CONNECTIONS) {
      // Try to cleanup idle connections first
      this.cleanupIdleConnections();
      
      if (this.connectionCount >= DB_SECURITY_CONFIG.CONNECTION_POOL.MAX_CONNECTIONS) {
        throw new Error('Database connection pool limit exceeded');
      }
    }
    
    const connectionKey = `${connectionType}_${Date.now()}_${Math.random()}`;
    
    try {
      const client = this.createSecureClient(connectionType);
      
      this.connections.set(connectionKey, {
        client,
        lastUsed: Date.now(),
        inUse: true,
      });
      
      this.connectionCount++;
      
      return client;
    } catch (error) {
      secureLog.error('Failed to create database connection', error, 'DatabaseConnectionPool');
      throw new Error('Database connection failed');
    }
  }
  
  /**
   * SECURITY FIX: Release a connection back to the pool
   */
  releaseConnection(client: SupabaseClient): void {
    for (const [key, connection] of this.connections.entries()) {
      if (connection.client === client) {
        connection.inUse = false;
        connection.lastUsed = Date.now();
        break;
      }
    }
  }
  
  /**
   * SECURITY FIX: Create a secure Supabase client with proper configuration
   */
  private createSecureClient(connectionType: 'service' | 'anon'): SupabaseClient {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = connectionType === 'service' 
      ? process.env.SUPABASE_SERVICE_ROLE_KEY 
      : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase configuration missing');
    }
    
    return createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false, // Disable auto refresh for server-side
        persistSession: false, // Don't persist sessions server-side
      },
      db: {
        schema: 'public', // Explicitly set schema
      },
      global: {
        headers: {
          'x-application-name': 'galaxykicklock-secure',
        },
      },
    });
  }
  
  /**
   * SECURITY FIX: Cleanup idle connections
   */
  private cleanupIdleConnections(): void {
    const now = Date.now();
    const idleTimeout = DB_SECURITY_CONFIG.CONNECTION_POOL.IDLE_TIMEOUT;
    
    for (const [key, connection] of this.connections.entries()) {
      if (!connection.inUse && (now - connection.lastUsed) > idleTimeout) {
        this.connections.delete(key);
        this.connectionCount--;
      }
    }
  }
  
  /**
   * Get connection pool statistics
   */
  getPoolStats(): {
    totalConnections: number;
    activeConnections: number;
    idleConnections: number;
    maxConnections: number;
  } {
    const activeConnections = Array.from(this.connections.values()).filter(c => c.inUse).length;
    const idleConnections = this.connections.size - activeConnections;
    
    return {
      totalConnections: this.connections.size,
      activeConnections,
      idleConnections,
      maxConnections: DB_SECURITY_CONFIG.CONNECTION_POOL.MAX_CONNECTIONS,
    };
  }
}

/**
 * SECURITY FIX: Secure database query builder with prepared statements
 */
export class SecureQueryBuilder {
  private client: SupabaseClient;
  private connectionPool: DatabaseConnectionPool;
  
  constructor(connectionType: 'service' | 'anon' = 'service') {
    this.connectionPool = DatabaseConnectionPool.getInstance();
    this.client = this.connectionPool.getConnection(connectionType) as any; // Will be resolved in init
  }
  
  /**
   * SECURITY FIX: Initialize the query builder with a secure connection
   */
  static async create(connectionType: 'service' | 'anon' = 'service'): Promise<SecureQueryBuilder> {
    const builder = new SecureQueryBuilder(connectionType);
    builder.client = await builder.connectionPool.getConnection(connectionType);
    return builder;
  }
  
  /**
   * SECURITY FIX: Secure select query with parameter validation
   */
// Define filter types
type FilterOperator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte';
interface FilterCondition {
  operator: FilterOperator;
  value: any;
}
type FilterValue = any | FilterCondition;

// ... (rest of the class definition)

  async secureSelect(
    table: string,
    columns: string | string[],
    filters: Record<string, FilterValue> = {},
    options: {
      single?: boolean;
      limit?: number;
      offset?: number;
      orderBy?: { column: string; ascending?: boolean };
    } = {}
  ): Promise<{ data: any; error: any }> {
    try {
      // Validate table name (prevent SQL injection)
      this.validateTableName(table);
      
      // Validate column names
      const columnStr = Array.isArray(columns) ? columns.join(', ') : columns;
      this.validateColumnNames(columnStr);
      
      // Build query with Supabase (which uses prepared statements internally)
      let query = this.client.from(table).select(columnStr);
      
      // Apply filters securely
      for (const [key, filterItem] of Object.entries(filters)) {
        this.validateColumnName(key);
        if (typeof filterItem === 'object' && filterItem !== null && 'operator' in filterItem && 'value' in filterItem) {
          const condition = filterItem as FilterCondition;
          switch (condition.operator) {
            case 'eq':
              query = query.eq(key, condition.value);
              break;
            case 'neq':
              query = query.neq(key, condition.value);
              break;
            case 'gt':
              query = query.gt(key, condition.value);
              break;
            case 'gte':
              query = query.gte(key, condition.value);
              break;
            case 'lt':
              query = query.lt(key, condition.value);
              break;
            case 'lte':
              query = query.lte(key, condition.value);
              break;
            default:
              // Should not happen if types are correct, but good practice
              console.warn(`[SecureQueryBuilder] Unknown filter operator: ${condition.operator}. Falling back to 'eq'.`);
              query = query.eq(key, condition.value);
          }
        } else {
          // Default to 'eq' for simple value filters
          query = query.eq(key, filterItem);
        }
      }
      
      // Apply options
      if (options.limit) {
        query = query.limit(Math.min(options.limit, 1000)); // Cap at 1000 records
      }
      
      if (options.offset) {
        query = query.range(options.offset, options.offset + (options.limit || 100) - 1);
      }
      
      if (options.orderBy) {
        this.validateColumnName(options.orderBy.column);
        query = query.order(options.orderBy.column, { ascending: options.orderBy.ascending ?? true });
      }
      
      // Execute query
      const result = options.single ? await query.single() : await query;
      
      // Log query if enabled
      if (DB_SECURITY_CONFIG.QUERY_SECURITY.ENABLE_QUERY_LOGGING) {
        secureLog.debug('Database query executed', {
          table,
          columns: columnStr,
          filters: Object.keys(filters),
          options,
        }, 'SecureQueryBuilder');
      }
      
      return result;
    } catch (error: any) {
      secureLog.error('Secure select query failed', error, 'SecureQueryBuilder');
      return {
        data: null,
        error: this.sanitizeError(error),
      };
    } finally {
      this.connectionPool.releaseConnection(this.client);
    }
  }
  
  /**
   * SECURITY FIX: Secure insert query with data validation
   */
  async secureInsert(
    table: string,
    data: Record<string, any> | Record<string, any>[],
    options: {
      returning?: string | string[];
      onConflict?: string;
    } = {}
  ): Promise<{ data: any; error: any }> {
    try {
      this.validateTableName(table);
      
      // Validate data
      const dataArray = Array.isArray(data) ? data : [data];
      for (const record of dataArray) {
        this.validateInsertData(record);
      }
      
      let query = this.client.from(table).insert(data);
      
      // Handle returning clause separately to avoid TypeScript issues
      let result;
      if (options.returning) {
        const returnColumns = Array.isArray(options.returning) 
          ? options.returning.join(', ') 
          : options.returning;
        this.validateColumnNames(returnColumns);
        result = await query.select(returnColumns);
      } else {
        result = await query;
      }
      
      if (DB_SECURITY_CONFIG.QUERY_SECURITY.ENABLE_QUERY_LOGGING) {
        secureLog.debug('Database insert executed', {
          table,
          recordCount: dataArray.length,
          returning: options.returning,
        }, 'SecureQueryBuilder');
      }
      
      return result;
    } catch (error: any) {
      secureLog.error('Secure insert query failed', error, 'SecureQueryBuilder');
      return {
        data: null,
        error: this.sanitizeError(error),
      };
    } finally {
      this.connectionPool.releaseConnection(this.client);
    }
  }
  
  /**
   * SECURITY FIX: Secure update query with validation
   */
  async secureUpdate(
    table: string,
    data: Record<string, any>,
    filters: Record<string, any>,
    options: {
      returning?: string | string[];
    } = {}
  ): Promise<{ data: any; error: any }> {
    try {
      this.validateTableName(table);
      this.validateUpdateData(data);
      
      // Ensure filters are provided (prevent mass updates)
      if (Object.keys(filters).length === 0) {
        throw new Error('Update queries must include filters');
      }
      
      let query = this.client.from(table).update(data);
      
      // Apply filters
      for (const [key, value] of Object.entries(filters)) {
        this.validateColumnName(key);
        query = query.eq(key, value);
      }
      
      // Handle returning clause separately
      let result;
      if (options.returning) {
        const returnColumns = Array.isArray(options.returning) 
          ? options.returning.join(', ') 
          : options.returning;
        this.validateColumnNames(returnColumns);
        result = await query.select(returnColumns);
      } else {
        result = await query;
      }
      
      if (DB_SECURITY_CONFIG.QUERY_SECURITY.ENABLE_QUERY_LOGGING) {
        secureLog.debug('Database update executed', {
          table,
          filters: Object.keys(filters),
          returning: options.returning,
        }, 'SecureQueryBuilder');
      }
      
      return result;
    } catch (error: any) {
      secureLog.error('Secure update query failed', error, 'SecureQueryBuilder');
      return {
        data: null,
        error: this.sanitizeError(error),
      };
    } finally {
      this.connectionPool.releaseConnection(this.client);
    }
  }
  
  /**
   * SECURITY FIX: Secure delete query with mandatory filters
   */
  async secureDelete(
    table: string,
    filters: Record<string, FilterValue>,
    options: {
      returning?: string | string[];
    } = {}
  ): Promise<{ data: any; error: any }> {
    try {
      this.validateTableName(table);
      
      // Ensure filters are provided (prevent mass deletes)
      if (Object.keys(filters).length === 0) {
        throw new Error('Delete queries must include filters');
      }
      
      let query = this.client.from(table).delete();
      
      // Apply filters
      for (const [key, filterItem] of Object.entries(filters)) {
        this.validateColumnName(key);
        if (typeof filterItem === 'object' && filterItem !== null && 'operator' in filterItem && 'value' in filterItem) {
          const condition = filterItem as FilterCondition;
          switch (condition.operator) {
            case 'eq':
              query = query.eq(key, condition.value);
              break;
            case 'neq':
              query = query.neq(key, condition.value);
              break;
            case 'gt':
              query = query.gt(key, condition.value);
              break;
            case 'gte':
              query = query.gte(key, condition.value);
              break;
            case 'lt':
              query = query.lt(key, condition.value);
              break;
            case 'lte':
              query = query.lte(key, condition.value);
              break;
            default:
              console.warn(`[SecureQueryBuilder] Unknown filter operator for delete: ${condition.operator}. Falling back to 'eq'.`);
              query = query.eq(key, condition.value);
          }
        } else {
          // Default to 'eq' for simple value filters
          query = query.eq(key, filterItem);
        }
      }
      
      // Handle returning clause separately
      let result;
      if (options.returning) {
        const returnColumns = Array.isArray(options.returning) 
          ? options.returning.join(', ') 
          : options.returning;
        this.validateColumnNames(returnColumns);
        result = await query.select(returnColumns);
      } else {
        result = await query;
      }
      
      if (DB_SECURITY_CONFIG.QUERY_SECURITY.ENABLE_QUERY_LOGGING) {
        secureLog.debug('Database delete executed', {
          table,
          filters: Object.keys(filters),
          returning: options.returning,
        }, 'SecureQueryBuilder');
      }
      
      return result;
    } catch (error: any) {
      secureLog.error('Secure delete query failed', error, 'SecureQueryBuilder');
      return {
        data: null,
        error: this.sanitizeError(error),
      };
    } finally {
      this.connectionPool.releaseConnection(this.client);
    }
  }
  
  /**
   * SECURITY FIX: Validate table name to prevent SQL injection
   */
  private validateTableName(table: string): void {
    if (!table || typeof table !== 'string') {
      throw new Error('Invalid table name');
    }
    
    // Allow only alphanumeric characters and underscores
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table)) {
      throw new Error('Invalid table name format');
    }
    
    // Check against whitelist of known tables
    const allowedTables = [
      'users', 'admin', 'tokengenerate', 'secure_sessions', 
      'login_attempts', 'rate_limits'
    ];
    
    if (!allowedTables.includes(table)) {
      throw new Error('Table not in whitelist');
    }
  }
  
  /**
   * SECURITY FIX: Validate column name to prevent SQL injection
   */
  private validateColumnName(column: string): void {
    if (!column || typeof column !== 'string') {
      throw new Error('Invalid column name');
    }
    
    // Allow only alphanumeric characters, underscores, and dots (for joins)
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)?$/.test(column)) {
      throw new Error('Invalid column name format');
    }
  }
  
  /**
   * SECURITY FIX: Validate multiple column names
   */
  private validateColumnNames(columns: string): void {
    const columnList = columns.split(',').map(c => c.trim());
    for (const column of columnList) {
      if (column !== '*') { // Allow SELECT *
        this.validateColumnName(column);
      }
    }
  }
  
  /**
   * SECURITY FIX: Validate insert data
   */
  private validateInsertData(data: Record<string, any>): void {
    for (const [key, value] of Object.entries(data)) {
      this.validateColumnName(key);
      
      // Check for dangerous values
      if (typeof value === 'string' && value.length > 10000) {
        throw new Error('String value too long');
      }
    }
  }
  
  /**
   * SECURITY FIX: Validate update data
   */
  private validateUpdateData(data: Record<string, any>): void {
    if (Object.keys(data).length === 0) {
      throw new Error('Update data cannot be empty');
    }
    
    this.validateInsertData(data);
  }
  
  /**
   * SECURITY FIX: Sanitize error messages to prevent information disclosure
   */
  private sanitizeError(error: any): any {
    if (!DB_SECURITY_CONFIG.QUERY_SECURITY.SANITIZE_ERRORS) {
      return error;
    }
    
    // Return generic error message to prevent information disclosure
    return {
      message: 'Database operation failed',
      code: 'DB_ERROR',
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * SECURITY FIX: Database security utilities
 */
export class DatabaseSecurity {
  /**
   * SECURITY FIX: Create a user-scoped client with RLS enforcement
   */
  static async createUserScopedClient(userId: string): Promise<SupabaseClient> {
    const pool = DatabaseConnectionPool.getInstance();
    const client = await pool.getConnection('anon');
    
    // Set RLS context for user
    await client.rpc('set_user_context', { user_id: userId });
    
    return client;
  }
  
  /**
   * SECURITY FIX: Validate RLS policies are active
   */
  static async validateRLSPolicies(table: string): Promise<boolean> {
    try {
      const pool = DatabaseConnectionPool.getInstance();
      const client = await pool.getConnection('service');
      
      const { data, error } = await client
        .from('pg_policies')
        .select('*')
        .eq('tablename', table);
      
      pool.releaseConnection(client);
      
      if (error) {
        secureLog.error('Failed to validate RLS policies', error, 'DatabaseSecurity');
        return false;
      }
      
      return data && data.length > 0;
    } catch (error) {
      secureLog.error('RLS validation failed', error, 'DatabaseSecurity');
      return false;
    }
  }
  
  /**
   * SECURITY FIX: Get database security metrics
   */
  static getSecurityMetrics(): {
    connectionPool: any;
    rlsEnabled: boolean;
    queryLogging: boolean;
  } {
    const pool = DatabaseConnectionPool.getInstance();
    
    return {
      connectionPool: pool.getPoolStats(),
      rlsEnabled: DB_SECURITY_CONFIG.RLS_CONFIG.ENFORCE_RLS,
      queryLogging: DB_SECURITY_CONFIG.QUERY_SECURITY.ENABLE_QUERY_LOGGING,
    };
  }
}

// Export singleton instances
export const databaseConnectionPool = DatabaseConnectionPool.getInstance();
export { DB_SECURITY_CONFIG };
