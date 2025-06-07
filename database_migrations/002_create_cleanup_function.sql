-- SECURITY FIX: Create automatic cleanup function for login_attempts table
-- This function removes login attempts older than 24 hours to prevent table bloat
-- while maintaining recent data for rate limiting

CREATE OR REPLACE FUNCTION cleanup_old_login_attempts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Delete login attempts older than 24 hours
    DELETE FROM login_attempts 
    WHERE attempted_at < NOW() - INTERVAL '24 hours';
    
    -- Log the cleanup operation (optional)
    RAISE NOTICE 'Cleaned up old login attempts at %', NOW();
END;
$$;

-- Create a scheduled job to run cleanup daily (if pg_cron extension is available)
-- Note: This requires the pg_cron extension to be enabled in Supabase
-- You can also run this manually or via a cron job on your server

-- Example cron job (uncomment if pg_cron is available):
-- SELECT cron.schedule('cleanup-login-attempts', '0 2 * * *', 'SELECT cleanup_old_login_attempts();');

-- Alternative: Create a trigger-based cleanup that runs periodically
-- This approach cleans up old records when new ones are inserted

CREATE OR REPLACE FUNCTION trigger_cleanup_login_attempts()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Only run cleanup occasionally (1 in 100 chance) to avoid performance impact
    IF random() < 0.01 THEN
        PERFORM cleanup_old_login_attempts();
    END IF;
    
    RETURN NEW;
END;
$$;

-- Create trigger that occasionally cleans up old records
DROP TRIGGER IF EXISTS trigger_periodic_cleanup ON login_attempts;
CREATE TRIGGER trigger_periodic_cleanup
    AFTER INSERT ON login_attempts
    FOR EACH ROW
    EXECUTE FUNCTION trigger_cleanup_login_attempts();

-- Add comments
COMMENT ON FUNCTION cleanup_old_login_attempts() IS 'Removes login attempts older than 24 hours to prevent table bloat';
COMMENT ON FUNCTION trigger_cleanup_login_attempts() IS 'Trigger function that occasionally runs cleanup to maintain table size';
