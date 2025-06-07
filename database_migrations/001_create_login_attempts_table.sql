-- SECURITY FIX: Create login_attempts table for database-backed rate limiting
-- This table stores login attempts to provide persistent rate limiting across server restarts
-- and multiple server instances

CREATE TABLE IF NOT EXISTS login_attempts (
    id BIGSERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL,
    attempted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    ip_address INET, -- Optional: can store IP address for enhanced rate limiting
    user_agent TEXT, -- Optional: can store user agent for analysis
    success BOOLEAN DEFAULT FALSE, -- Optional: track successful vs failed attempts
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_login_attempts_username_time 
ON login_attempts (username, attempted_at DESC);

CREATE INDEX IF NOT EXISTS idx_login_attempts_attempted_at 
ON login_attempts (attempted_at);

-- Optional: Create index on IP address if you plan to use IP-based rate limiting
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip_time 
ON login_attempts (ip_address, attempted_at DESC);

-- Add Row Level Security (RLS) for additional security
ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;

-- Create policy to allow service role to manage all records
CREATE POLICY "Service role can manage login attempts" ON login_attempts
    FOR ALL USING (auth.role() = 'service_role');

-- Optional: Create a policy for authenticated users to view only their own attempts
CREATE POLICY "Users can view own login attempts" ON login_attempts
    FOR SELECT USING (auth.jwt() ->> 'username' = username);

-- Add comments for documentation
COMMENT ON TABLE login_attempts IS 'Stores login attempts for rate limiting and security monitoring';
COMMENT ON COLUMN login_attempts.username IS 'Username attempting to login (case-insensitive)';
COMMENT ON COLUMN login_attempts.attempted_at IS 'Timestamp of the login attempt';
COMMENT ON COLUMN login_attempts.ip_address IS 'IP address of the client (optional)';
COMMENT ON COLUMN login_attempts.user_agent IS 'User agent string (optional)';
COMMENT ON COLUMN login_attempts.success IS 'Whether the login attempt was successful (optional)';
