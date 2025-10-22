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
