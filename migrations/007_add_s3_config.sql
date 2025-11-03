-- Migration: Add S3 configuration to projects table
-- Description: Adds S3 image upload capability with hybrid global/per-project configuration
-- Created: 2025-11-03

-- Add S3 configuration fields to projects table
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS use_s3_for_images BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS s3_config JSONB DEFAULT NULL;

-- Add comments for documentation
COMMENT ON COLUMN projects.use_s3_for_images IS 'Enable S3 upload for Unsplash images (default: false, uses Unsplash direct URLs)';
COMMENT ON COLUMN projects.s3_config IS 'Per-project S3 credentials (overrides global env vars). Format: {"endpoint": "...", "accessKeyId": "...", "secretAccessKey": "...", "bucket": "...", "region": "...", "publicUrl": "..."}';

-- Set default values for existing projects (keep current behavior)
UPDATE projects
SET use_s3_for_images = FALSE
WHERE use_s3_for_images IS NULL;

-- Create index for projects using S3 (for faster filtering)
CREATE INDEX IF NOT EXISTS idx_projects_use_s3 ON projects(use_s3_for_images)
WHERE use_s3_for_images = TRUE;

-- Validation: Check that s3_config has required fields when present
-- Note: This is a constraint check, not enforced by the database
-- Validation should be done in the application layer
