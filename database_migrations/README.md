# Database Migrations for Security Fixes

This directory contains SQL migration scripts to implement database-backed rate limiting and other security improvements.

## Security Fix: Database-Backed Rate Limiting

The application has been updated to use database-backed rate limiting instead of in-memory storage. This provides:

- **Persistence**: Rate limiting data survives server restarts
- **Scalability**: Works across multiple server instances
- **Reliability**: Consistent rate limiting in distributed environments

## Migration Files

### 001_create_login_attempts_table.sql
Creates the `login_attempts` table with:
- Username tracking
- Timestamp indexing for efficient queries
- Optional IP address and user agent storage
- Row Level Security (RLS) policies
- Proper indexes for performance

### 002_create_cleanup_function.sql
Creates automatic cleanup mechanisms:
- Function to remove old login attempts (>24 hours)
- Trigger-based periodic cleanup
- Optional cron job setup (if pg_cron extension is available)

## How to Apply Migrations

### Option 1: Supabase Dashboard (Recommended)
1. Go to your Supabase project dashboard
2. Navigate to "SQL Editor"
3. Copy and paste the contents of each migration file
4. Execute them in order (001, then 002)

### Option 2: Supabase CLI
```bash
# If you have Supabase CLI installed
supabase db reset
# Or apply individual migrations
psql -h your-supabase-host -U postgres -d postgres -f 001_create_login_attempts_table.sql
psql -h your-supabase-host -U postgres -d postgres -f 002_create_cleanup_function.sql
```

### Option 3: Direct Database Connection
Connect to your Supabase PostgreSQL database and execute the SQL files directly.

## Verification

After applying the migrations, verify the setup:

```sql
-- Check if table exists
SELECT table_name FROM information_schema.tables WHERE table_name = 'login_attempts';

-- Check indexes
SELECT indexname FROM pg_indexes WHERE tablename = 'login_attempts';

-- Check RLS policies
SELECT policyname, cmd, qual FROM pg_policies WHERE tablename = 'login_attempts';

-- Test the cleanup function
SELECT cleanup_old_login_attempts();
```

## Security Benefits

1. **Rate Limiting Persistence**: Login attempts are now tracked in the database
2. **Multi-Instance Support**: Works correctly with load balancers and multiple servers
3. **Automatic Cleanup**: Prevents database bloat with automatic old record removal
4. **Enhanced Security**: Row Level Security policies protect the data
5. **Performance Optimized**: Proper indexes ensure fast queries

## Monitoring

You can monitor login attempts with queries like:

```sql
-- Recent login attempts by username
SELECT username, COUNT(*) as attempts, MAX(attempted_at) as last_attempt
FROM login_attempts 
WHERE attempted_at > NOW() - INTERVAL '1 hour'
GROUP BY username
ORDER BY attempts DESC;

-- Failed login attempts in the last 24 hours
SELECT DATE_TRUNC('hour', attempted_at) as hour, COUNT(*) as attempts
FROM login_attempts 
WHERE attempted_at > NOW() - INTERVAL '24 hours'
GROUP BY hour
ORDER BY hour;
```

## Maintenance

The cleanup function automatically removes old records, but you can also:

1. **Manual cleanup**: `SELECT cleanup_old_login_attempts();`
2. **Adjust retention period**: Modify the cleanup function to change the 24-hour retention
3. **Monitor table size**: Check table size periodically to ensure cleanup is working

## Troubleshooting

If you encounter issues:

1. **Permission errors**: Ensure your service role has proper permissions
2. **Index issues**: Verify indexes were created successfully
3. **RLS problems**: Check that RLS policies allow your service role access
4. **Performance**: Monitor query performance and adjust indexes if needed
