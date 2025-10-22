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
