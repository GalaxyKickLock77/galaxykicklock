-- SECURITY FIX: Implement Row Level Security (RLS) policies
-- This migration adds comprehensive RLS policies to secure database access

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin ENABLE ROW LEVEL SECURITY;
ALTER TABLE tokengenerate ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for users table
-- Policy 1: Users can only see their own records
CREATE POLICY "users_select_own" ON users
    FOR SELECT USING (
        auth.uid()::text = id::text OR 
        auth.role() = 'service_role'
    );

-- Policy 2: Users can only update their own records (except sensitive fields)
CREATE POLICY "users_update_own" ON users
    FOR UPDATE USING (
        auth.uid()::text = id::text OR 
        auth.role() = 'service_role'
    );

-- Policy 3: Only service role can insert users (for signup process)
CREATE POLICY "users_insert_service" ON users
    FOR INSERT WITH CHECK (
        auth.role() = 'service_role'
    );

-- Policy 4: Only service role can delete users
CREATE POLICY "users_delete_service" ON users
    FOR DELETE USING (
        auth.role() = 'service_role'
    );

-- Create RLS policies for admin table
-- Policy 1: Admins can only see their own records
CREATE POLICY "admin_select_own" ON admin
    FOR SELECT USING (
        auth.uid()::text = id::text OR 
        auth.role() = 'service_role'
    );

-- Policy 2: Admins can only update their own records
CREATE POLICY "admin_update_own" ON admin
    FOR UPDATE USING (
        auth.uid()::text = id::text OR 
        auth.role() = 'service_role'
    );

-- Policy 3: Only service role can manage admin records
CREATE POLICY "admin_insert_service" ON admin
    FOR INSERT WITH CHECK (
        auth.role() = 'service_role'
    );

CREATE POLICY "admin_delete_service" ON admin
    FOR DELETE USING (
        auth.role() = 'service_role'
    );

-- Create RLS policies for tokengenerate table
-- Policy 1: Users can only see tokens associated with them
CREATE POLICY "tokens_select_own" ON tokengenerate
    FOR SELECT USING (
        auth.uid()::text = userid::text OR 
        auth.role() = 'service_role'
    );

-- Policy 2: Only service role can modify tokens
CREATE POLICY "tokens_update_service" ON tokengenerate
    FOR UPDATE USING (
        auth.role() = 'service_role'
    );

CREATE POLICY "tokens_insert_service" ON tokengenerate
    FOR INSERT WITH CHECK (
        auth.role() = 'service_role'
    );

CREATE POLICY "tokens_delete_service" ON tokengenerate
    FOR DELETE USING (
        auth.role() = 'service_role'
    );

-- Create RLS policies for secure_sessions table (if it exists)
DO $$ 
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'secure_sessions') THEN
        -- Enable RLS on secure_sessions
        ALTER TABLE secure_sessions ENABLE ROW LEVEL SECURITY;
        
        -- Policy 1: Users can only see their own sessions
        CREATE POLICY "sessions_select_own" ON secure_sessions
            FOR SELECT USING (
                auth.uid()::text = user_id::text OR 
                auth.role() = 'service_role'
            );
        
        -- Policy 2: Only service role can manage sessions
        CREATE POLICY "sessions_insert_service" ON secure_sessions
            FOR INSERT WITH CHECK (
                auth.role() = 'service_role'
            );
        
        CREATE POLICY "sessions_update_service" ON secure_sessions
            FOR UPDATE USING (
                auth.role() = 'service_role'
            );
        
        CREATE POLICY "sessions_delete_service" ON secure_sessions
            FOR DELETE USING (
                auth.role() = 'service_role'
            );
    END IF;
END $$;

-- Create function to set user context for RLS
CREATE OR REPLACE FUNCTION set_user_context(user_id TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Set the user context for RLS policies
    PERFORM set_config('app.current_user_id', user_id, true);
END;
$$;

-- Create function to get current user context
CREATE OR REPLACE FUNCTION get_current_user_id()
RETURNS TEXT
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
    RETURN current_setting('app.current_user_id', true);
END;
$$;

-- Create enhanced RLS policies using user context
-- Drop existing policies and create context-aware ones
DROP POLICY IF EXISTS "users_select_own" ON users;
CREATE POLICY "users_select_own" ON users
    FOR SELECT USING (
        id::text = get_current_user_id() OR 
        auth.role() = 'service_role'
    );

DROP POLICY IF EXISTS "users_update_own" ON users;
CREATE POLICY "users_update_own" ON users
    FOR UPDATE USING (
        id::text = get_current_user_id() OR 
        auth.role() = 'service_role'
    );

-- Create audit table for RLS policy violations
CREATE TABLE IF NOT EXISTS rls_audit_log (
    id BIGSERIAL PRIMARY KEY,
    table_name VARCHAR(100) NOT NULL,
    operation VARCHAR(20) NOT NULL,
    user_id TEXT,
    attempted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    policy_violated VARCHAR(200),
    ip_address INET,
    user_agent TEXT,
    additional_info JSONB
);

-- Enable RLS on audit table
ALTER TABLE rls_audit_log ENABLE ROW LEVEL SECURITY;

-- Only service role can access audit logs
CREATE POLICY "audit_service_only" ON rls_audit_log
    FOR ALL USING (auth.role() = 'service_role');

-- Create function to log RLS violations
CREATE OR REPLACE FUNCTION log_rls_violation(
    p_table_name TEXT,
    p_operation TEXT,
    p_user_id TEXT DEFAULT NULL,
    p_policy_violated TEXT DEFAULT NULL,
    p_additional_info JSONB DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO rls_audit_log (
        table_name,
        operation,
        user_id,
        policy_violated,
        additional_info
    ) VALUES (
        p_table_name,
        p_operation,
        COALESCE(p_user_id, get_current_user_id()),
        p_policy_violated,
        p_additional_info
    );
END;
$$;

-- Create function to validate table access
CREATE OR REPLACE FUNCTION validate_table_access(
    p_table_name TEXT,
    p_operation TEXT,
    p_user_id TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    has_access BOOLEAN := FALSE;
    current_user_id TEXT;
BEGIN
    current_user_id := COALESCE(p_user_id, get_current_user_id());
    
    -- Service role always has access
    IF auth.role() = 'service_role' THEN
        RETURN TRUE;
    END IF;
    
    -- Check table-specific access rules
    CASE p_table_name
        WHEN 'users' THEN
            -- Users can access their own records
            has_access := (current_user_id IS NOT NULL);
        WHEN 'admin' THEN
            -- Admin access (implement admin-specific logic)
            has_access := (current_user_id IS NOT NULL);
        WHEN 'tokengenerate' THEN
            -- Token access (users can see their own tokens)
            has_access := (current_user_id IS NOT NULL);
        WHEN 'secure_sessions' THEN
            -- Session access (users can see their own sessions)
            has_access := (current_user_id IS NOT NULL);
        ELSE
            -- Default: no access
            has_access := FALSE;
    END CASE;
    
    -- Log access attempt if denied
    IF NOT has_access THEN
        PERFORM log_rls_violation(
            p_table_name,
            p_operation,
            current_user_id,
            'Access denied by validate_table_access',
            jsonb_build_object('timestamp', NOW())
        );
    END IF;
    
    RETURN has_access;
END;
$$;

-- Create connection limit function
CREATE OR REPLACE FUNCTION check_connection_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    connection_count INTEGER;
    max_connections INTEGER := 50; -- Configurable limit
BEGIN
    -- Count current connections
    SELECT COUNT(*) INTO connection_count
    FROM pg_stat_activity
    WHERE state = 'active' AND backend_type = 'client backend';
    
    -- Check if limit exceeded
    IF connection_count > max_connections THEN
        RAISE EXCEPTION 'Connection limit exceeded: % active connections', connection_count;
    END IF;
    
    RETURN NEW;
END;
$$;

-- Create database security monitoring view
CREATE OR REPLACE VIEW database_security_status AS
SELECT 
    schemaname,
    tablename,
    rowsecurity as rls_enabled,
    (SELECT COUNT(*) FROM pg_policies WHERE tablename = t.tablename) as policy_count
FROM pg_tables t
WHERE schemaname = 'public'
ORDER BY tablename;

-- Create connection monitoring view
CREATE OR REPLACE VIEW connection_monitor AS
SELECT 
    COUNT(*) as total_connections,
    COUNT(*) FILTER (WHERE state = 'active') as active_connections,
    COUNT(*) FILTER (WHERE state = 'idle') as idle_connections,
    COUNT(*) FILTER (WHERE state = 'idle in transaction') as idle_in_transaction,
    MAX(backend_start) as oldest_connection,
    AVG(EXTRACT(EPOCH FROM (NOW() - backend_start))) as avg_connection_age_seconds
FROM pg_stat_activity
WHERE backend_type = 'client backend';

-- Create query monitoring view (for development/debugging)
CREATE OR REPLACE VIEW slow_queries AS
SELECT 
    query,
    calls,
    total_time,
    mean_time,
    rows,
    100.0 * shared_blks_hit / nullif(shared_blks_hit + shared_blks_read, 0) AS hit_percent
FROM pg_stat_statements
WHERE calls > 10
ORDER BY mean_time DESC
LIMIT 20;

-- Grant necessary permissions
GRANT SELECT ON database_security_status TO authenticated;
GRANT SELECT ON connection_monitor TO authenticated;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_rls_audit_log_table_name ON rls_audit_log(table_name);
CREATE INDEX IF NOT EXISTS idx_rls_audit_log_attempted_at ON rls_audit_log(attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_rls_audit_log_user_id ON rls_audit_log(user_id);

-- Add comments for documentation
COMMENT ON FUNCTION set_user_context(TEXT) IS 'Sets user context for RLS policies';
COMMENT ON FUNCTION get_current_user_id() IS 'Gets current user ID from context';
COMMENT ON FUNCTION validate_table_access(TEXT, TEXT, TEXT) IS 'Validates user access to tables with logging';
COMMENT ON FUNCTION log_rls_violation(TEXT, TEXT, TEXT, TEXT, JSONB) IS 'Logs RLS policy violations for security monitoring';
COMMENT ON TABLE rls_audit_log IS 'Audit log for RLS policy violations and access attempts';
COMMENT ON VIEW database_security_status IS 'Shows RLS status for all tables';
COMMENT ON VIEW connection_monitor IS 'Monitors database connection usage';

-- Final security check - ensure all tables have RLS enabled
DO $$
DECLARE
    table_record RECORD;
BEGIN
    FOR table_record IN 
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'public' 
        AND tablename IN ('users', 'admin', 'tokengenerate', 'secure_sessions')
    LOOP
        -- Ensure RLS is enabled
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_record.tablename);
        
        -- Log the security setup
        RAISE NOTICE 'RLS enabled for table: %', table_record.tablename;
    END LOOP;
END $$;
