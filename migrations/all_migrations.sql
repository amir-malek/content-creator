-- Create projects table
-- This table stores configuration for each blog project/platform

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  platform_type TEXT NOT NULL, -- Identifier for which adapter to use (e.g., 'custom-backend-v1', 'wordpress')
  endpoints JSONB NOT NULL, -- JSON object with API endpoint URLs
  auth_config JSONB NOT NULL, -- JSON object with tokens and authentication details
  parameters JSONB DEFAULT '{}', -- JSON object with platform-specific params (headers, default fields, etc.)
  style_config JSONB DEFAULT '{}', -- JSON object with content style guidelines
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_projects_name ON projects(name);
CREATE INDEX IF NOT EXISTS idx_projects_platform_type ON projects(platform_type);
CREATE INDEX IF NOT EXISTS idx_projects_is_active ON projects(is_active);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Example project entry (comment out in production)
-- INSERT INTO projects (name, platform_type, endpoints, auth_config, parameters, style_config)
-- VALUES (
--   'Tech Blog',
--   'custom-backend-v1',
--   '{"publish": "https://api.example.com/posts", "media": "https://api.example.com/upload"}',
--   '{"token": "your-api-token", "tokenExpiry": "2025-12-31T23:59:59Z"}',
--   '{"headers": {"X-Custom": "value"}, "defaultCategory": "blog"}',
--   '{"tone": "professional", "length": "medium", "includeImages": true}'
-- );
-- Create posts table
-- This table stores the post queue and publishing status

CREATE TYPE post_status AS ENUM ('pending', 'processing', 'published', 'failed');

CREATE TABLE IF NOT EXISTS posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  field_niche TEXT, -- Topic area or niche (e.g., "AI", "Web Development")
  keywords TEXT[], -- Array of keywords for research and content generation
  content_json JSONB, -- Platform-agnostic content format (title, body, images, metadata)
  status post_status DEFAULT 'pending',
  publish_date DATE NOT NULL,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  published_url TEXT, -- URL of the published post
  error_message TEXT, -- Last error message if failed
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  published_at TIMESTAMPTZ
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_posts_project_id ON posts(project_id);
CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
CREATE INDEX IF NOT EXISTS idx_posts_publish_date ON posts(publish_date);
CREATE INDEX IF NOT EXISTS idx_posts_status_publish_date ON posts(status, publish_date);

-- Create trigger to update updated_at timestamp
CREATE TRIGGER update_posts_updated_at
  BEFORE UPDATE ON posts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create trigger to set published_at when status changes to 'published'
CREATE OR REPLACE FUNCTION set_published_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'published' AND OLD.status != 'published' THEN
    NEW.published_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_posts_published_at
  BEFORE UPDATE ON posts
  FOR EACH ROW
  EXECUTE FUNCTION set_published_at();

-- Example post entry (comment out in production)
-- INSERT INTO posts (project_id, title, field_niche, keywords, publish_date)
-- VALUES (
--   (SELECT id FROM projects WHERE name = 'Tech Blog' LIMIT 1),
--   'The Future of AI in Web Development',
--   'Web Development',
--   ARRAY['AI', 'machine learning', 'web development', 'automation'],
--   CURRENT_DATE + INTERVAL '1 day'
-- );
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
