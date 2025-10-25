-- Cleanup script to remove partial migrations
-- Run this if migrations failed partway through

-- Drop tables in reverse dependency order
DROP TABLE IF EXISTS post_iterations CASCADE;
DROP TABLE IF EXISTS logs CASCADE;
DROP TABLE IF EXISTS posts CASCADE;
DROP TABLE IF EXISTS projects CASCADE;

-- Drop triggers
DROP TRIGGER IF EXISTS update_projects_updated_at ON projects CASCADE;
DROP TRIGGER IF EXISTS update_posts_updated_at ON posts CASCADE;

-- Drop functions
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;

-- Drop types
DROP TYPE IF EXISTS post_status CASCADE;
DROP TYPE IF EXISTS log_level CASCADE;

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Cleanup complete! You can now run migrations.';
END $$;
