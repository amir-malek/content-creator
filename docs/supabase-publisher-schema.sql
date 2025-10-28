-- Supabase Publisher Adapter - Example Table Schema
-- This file provides example SQL schemas for publishing blog posts to Supabase
-- Customize the table name, columns, and constraints to match your requirements

-- ====================
-- BASIC SCHEMA (Simple blog setup)
-- ====================

CREATE TABLE blog_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  images JSONB DEFAULT '[]'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add index on slug for faster lookups
CREATE INDEX idx_blog_posts_slug ON blog_posts(slug);

-- Add index on created_at for sorting
CREATE INDEX idx_blog_posts_created_at ON blog_posts(created_at DESC);

-- Enable Row Level Security (optional, recommended for multi-tenant setups)
ALTER TABLE blog_posts ENABLE ROW LEVEL SECURITY;

-- Example RLS policy: Allow public read access
CREATE POLICY "Allow public read access" ON blog_posts
  FOR SELECT USING (true);

-- Example RLS policy: Allow service role full access
CREATE POLICY "Allow service role all access" ON blog_posts
  USING (auth.jwt() ->> 'role' = 'service_role');


-- ====================
-- CUSTOM SCHEMA (Custom column names)
-- ====================

-- This example shows how to use custom column names with columnMapping
CREATE TABLE my_custom_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_title TEXT NOT NULL,              -- Maps from Content.title
  content_html TEXT NOT NULL,            -- Maps from Content.body
  url_slug TEXT UNIQUE NOT NULL,         -- Maps from generated slug
  featured_images JSONB DEFAULT '[]'::jsonb,  -- Maps from Content.images
  post_meta JSONB DEFAULT '{}'::jsonb,   -- Maps from Content.metadata
  published_date TIMESTAMPTZ DEFAULT NOW(),
  last_modified TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_custom_posts_slug ON my_custom_posts(url_slug);
CREATE INDEX idx_custom_posts_published ON my_custom_posts(published_date DESC);

-- Configuration for this custom schema:
-- {
--   platformType: 'supabase-publisher',
--   endpoints: { table: 'my_custom_posts' },
--   parameters: {
--     columnMapping: {
--       title: 'post_title',
--       body: 'content_html',
--       slug: 'url_slug',
--       images: 'featured_images',
--       metadata: 'post_meta'
--     }
--   }
-- }


-- ====================
-- ADVANCED SCHEMA (Multiple projects/categories)
-- ====================

-- This example shows a multi-project setup with categories and tags
CREATE TABLE articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,  -- Link to projects table
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  slug TEXT NOT NULL,
  excerpt TEXT,  -- Auto-generated from first 160 chars
  featured_image TEXT,  -- First image URL from Content.images
  images JSONB DEFAULT '[]'::jsonb,
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],  -- Array of tag names
  categories TEXT[] DEFAULT ARRAY[]::TEXT[],
  language VARCHAR(5) DEFAULT 'en',
  seo_metadata JSONB,  -- SEO-specific metadata
  custom_fields JSONB DEFAULT '{}'::jsonb,
  status TEXT DEFAULT 'published' CHECK (status IN ('draft', 'published', 'archived')),
  published_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, slug)  -- Unique slug per project
);

CREATE INDEX idx_articles_project_slug ON articles(project_id, slug);
CREATE INDEX idx_articles_status ON articles(status);
CREATE INDEX idx_articles_published_at ON articles(published_at DESC);
CREATE INDEX idx_articles_tags ON articles USING GIN(tags);  -- GIN index for array searches

-- Trigger to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_articles_updated_at
  BEFORE UPDATE ON articles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Example query to fetch posts by tag
-- SELECT * FROM articles WHERE 'technology' = ANY(tags);

-- Example query to fetch posts by project and status
-- SELECT * FROM articles WHERE project_id = 'xxx' AND status = 'published' ORDER BY published_at DESC;


-- ====================
-- CONTENT STRUCTURE NOTES
-- ====================

-- Images JSONB structure:
-- [
--   {
--     "url": "https://images.unsplash.com/photo-xxx",
--     "alt": "Image description",
--     "caption": "Optional caption"
--   }
-- ]

-- Metadata JSONB structure:
-- {
--   "tags": ["tag1", "tag2"],
--   "categories": ["category1"],
--   "publishDate": "2025-10-28T00:00:00.000Z",
--   "language": "en",
--   "customFields": {},
--   "seoMetadata": {
--     "localizedKeywords": ["keyword1", "keyword2"],
--     "metaDescription": "SEO description (150-160 chars)",
--     "ogLocale": "en_US",
--     "hrefLangAlternates": []
--   }
-- }


-- ====================
-- HELPER FUNCTIONS
-- ====================

-- Function to extract plain text from HTML body (for search, excerpts, etc.)
CREATE OR REPLACE FUNCTION extract_text(html TEXT)
RETURNS TEXT AS $$
BEGIN
  -- Simple regex to strip HTML tags
  RETURN regexp_replace(html, '<[^>]+>', '', 'g');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Example usage:
-- SELECT title, extract_text(body) as plain_text FROM blog_posts;

-- Function to generate full URL from slug
CREATE OR REPLACE FUNCTION get_post_url(slug TEXT, domain TEXT DEFAULT 'https://example.com')
RETURNS TEXT AS $$
BEGIN
  RETURN domain || '/posts/' || slug;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Example usage:
-- SELECT title, slug, get_post_url(slug, 'https://myblog.com') as url FROM blog_posts;
