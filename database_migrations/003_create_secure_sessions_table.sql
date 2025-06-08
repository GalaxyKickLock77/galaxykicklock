-- SECURITY FIX: Create secure_sessions table for enhanced session management
-- This table provides secure session storage with encryption, rotation, and monitoring

CREATE TABLE IF NOT EXISTS secure_sessions (
    id BIGSERIAL PRIMARY KEY,
    session_id VARCHAR(64) UNIQUE NOT NULL,
    user_id VARCHAR(50) NOT NULL,
    user_type VARCHAR(10) NOT NULL CHECK (user_type IN ('user', 'admin')),
    session_data TEXT NOT NULL, -- Encrypted session data
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    last_accessed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    invalidated_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    ip_address INET,
    user_agent TEXT,
    fingerprint VARCHAR(64), -- Browser fingerprint hash
    privilege_level VARCHAR(20) NOT NULL DEFAULT 'basic' CHECK (privilege_level IN ('basic', 'elevated', 'admin')),
    rotated_from VARCHAR(64), -- Reference to previous session if rotated
    rotation_count INTEGER NOT NULL DEFAULT 0,
    
    -- Constraints
    CONSTRAINT fk_secure_sessions_rotated_from 
        FOREIGN KEY (rotated_from) REFERENCES secure_sessions(session_id) ON DELETE SET NULL
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_secure_sessions_session_id 
    ON secure_sessions (session_id);

CREATE INDEX IF NOT EXISTS idx_secure_sessions_user_id_active 
    ON secure_sessions (user_id, is_active);

CREATE INDEX IF NOT EXISTS idx_secure_sessions_expires_at 
    ON secure_sessions (expires_at);

CREATE INDEX IF NOT EXISTS idx_secure_sessions_user_type_active 
    ON secure_sessions (user_type, is_active);

CREATE INDEX IF NOT EXISTS idx_secure_sessions_fingerprint 
    ON secure_sessions (fingerprint);

CREATE INDEX IF NOT EXISTS idx_secure_sessions_ip_address 
    ON secure_sessions (ip_address);

CREATE INDEX IF NOT EXISTS idx_secure_sessions_created_at 
    ON secure_sessions (created_at DESC);

-- Add Row Level Security (RLS)
ALTER TABLE secure_sessions ENABLE ROW LEVEL SECURITY;

-- Create policy to allow service role to manage all records
CREATE POLICY "Service role can manage secure sessions" ON secure_sessions
    FOR ALL USING (auth.role() = 'service_role');

-- Create policy for users to view only their own sessions (optional)
CREATE POLICY "Users can view own sessions" ON secure_sessions
    FOR SELECT USING (user_id = auth.jwt() ->> 'user_id');

-- Create function to automatically clean up expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Mark expired sessions as inactive
    UPDATE secure_sessions 
    SET is_active = FALSE, 
        invalidated_at = NOW()
    WHERE expires_at < NOW() 
      AND is_active = TRUE;
    
    -- Delete very old session records (older than 90 days)
    DELETE FROM secure_sessions 
    WHERE created_at < NOW() - INTERVAL '90 days';
    
    -- Log the cleanup operation
    RAISE NOTICE 'Cleaned up expired sessions at %', NOW();
END;
$$;

-- Create trigger-based cleanup that runs occasionally
CREATE OR REPLACE FUNCTION trigger_cleanup_expired_sessions()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Only run cleanup occasionally (1 in 50 chance) to avoid performance impact
    IF random() < 0.02 THEN
        PERFORM cleanup_expired_sessions();
    END IF;
    
    RETURN NEW;
END;
$$;

-- Create trigger that occasionally cleans up expired sessions
DROP TRIGGER IF EXISTS trigger_periodic_session_cleanup ON secure_sessions;
CREATE TRIGGER trigger_periodic_session_cleanup
    AFTER INSERT ON secure_sessions
    FOR EACH ROW
    EXECUTE FUNCTION trigger_cleanup_expired_sessions();

-- Create function to detect suspicious session activity
CREATE OR REPLACE FUNCTION detect_suspicious_session_activity(p_user_id VARCHAR(50))
RETURNS TABLE (
    user_id VARCHAR(50),
    active_sessions_count BIGINT,
    recent_sessions_count BIGINT,
    different_ips_count BIGINT,
    is_suspicious BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p_user_id,
        COUNT(*) FILTER (WHERE is_active = TRUE) as active_sessions_count,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 hour') as recent_sessions_count,
        COUNT(DISTINCT ip_address) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as different_ips_count,
        (
            COUNT(*) FILTER (WHERE is_active = TRUE) > 3 OR
            COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 hour') > 5 OR
            COUNT(DISTINCT ip_address) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') > 3
        ) as is_suspicious
    FROM secure_sessions 
    WHERE secure_sessions.user_id = p_user_id;
END;
$$;

-- Create view for session monitoring
CREATE OR REPLACE VIEW session_monitoring AS
SELECT 
    s.user_id,
    s.user_type,
    s.privilege_level,
    COUNT(*) FILTER (WHERE s.is_active = TRUE) as active_sessions,
    COUNT(*) as total_sessions,
    MAX(s.created_at) as last_login_at,
    COUNT(DISTINCT s.ip_address) as unique_ips,
    COUNT(*) FILTER (WHERE s.created_at > NOW() - INTERVAL '1 hour') as recent_sessions,
    (
        COUNT(*) FILTER (WHERE s.is_active = TRUE) > 3 OR
        COUNT(*) FILTER (WHERE s.created_at > NOW() - INTERVAL '1 hour') > 5 OR
        COUNT(DISTINCT s.ip_address) FILTER (WHERE s.created_at > NOW() - INTERVAL '24 hours') > 3
    ) as has_suspicious_activity
FROM secure_sessions s
GROUP BY s.user_id, s.user_type, s.privilege_level;

-- Add comments for documentation
COMMENT ON TABLE secure_sessions IS 'Secure session storage with encryption, rotation, and monitoring capabilities';
COMMENT ON COLUMN secure_sessions.session_id IS 'Unique session identifier (64 characters)';
COMMENT ON COLUMN secure_sessions.session_data IS 'Encrypted session data containing user information';
COMMENT ON COLUMN secure_sessions.fingerprint IS 'Browser fingerprint hash for session binding';
COMMENT ON COLUMN secure_sessions.privilege_level IS 'Current privilege level of the session';
COMMENT ON COLUMN secure_sessions.rotated_from IS 'Reference to previous session if this session was rotated';
COMMENT ON COLUMN secure_sessions.rotation_count IS 'Number of times this session has been rotated';

COMMENT ON FUNCTION cleanup_expired_sessions() IS 'Automatically cleans up expired and old session records';
COMMENT ON FUNCTION detect_suspicious_session_activity(VARCHAR) IS 'Detects suspicious session activity for a user';
COMMENT ON VIEW session_monitoring IS 'Provides session statistics and suspicious activity detection';
