-- Create logs table
-- This table stores activity logs, errors, and system events

CREATE TYPE log_level AS ENUM ('info', 'warning', 'error', 'debug');

CREATE TABLE IF NOT EXISTS logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES posts(id) ON DELETE SET NULL, -- Can be null for system-level logs
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  level log_level NOT NULL DEFAULT 'info',
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}', -- Additional structured data (e.g., API response, error details)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for faster log queries
CREATE INDEX IF NOT EXISTS idx_logs_post_id ON logs(post_id);
CREATE INDEX IF NOT EXISTS idx_logs_project_id ON logs(project_id);
CREATE INDEX IF NOT EXISTS idx_logs_level ON logs(level);
CREATE INDEX IF NOT EXISTS idx_logs_created_at ON logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_level_created_at ON logs(level, created_at DESC);

-- Create a function to automatically clean up old logs (older than 90 days)
CREATE OR REPLACE FUNCTION cleanup_old_logs()
RETURNS void AS $$
BEGIN
  DELETE FROM logs WHERE created_at < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;

-- Optional: Schedule automatic log cleanup with pg_cron
-- SELECT cron.schedule('cleanup-old-logs', '0 2 * * *', 'SELECT cleanup_old_logs();');
