-- DuoSpace Supabase Schema - Reference for the posts table structure
-- This file documents the expected schema for DuoSpace's Supabase database
-- The duospace-supabase adapter is hardcoded to work with this schema

-- ====================
-- DUOSPACE POSTS TABLE
-- ====================

-- This is the expected schema that the duospace-supabase adapter publishes to
-- You should NOT need to create this table - it already exists in DuoSpace's Supabase
-- This is provided for reference only

CREATE TABLE posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Core content fields
  title TEXT NOT NULL,                    -- Post title
  slug TEXT UNIQUE NOT NULL,              -- URL-friendly slug (auto-generated)
  content TEXT NOT NULL,                  -- HTML body content
  excerpt TEXT,                           -- Short excerpt (first 160 chars)
  metaDescription TEXT,                   -- SEO meta description (same as excerpt)

  -- Media
  featuredImage TEXT,                     -- URL of the featured image (first from Content.images)

  -- Categorization
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],    -- Array of tag strings

  -- Publishing metadata
  published BOOLEAN DEFAULT false,        -- Publication status (adapter sets to true)
  authorId TEXT NOT NULL,                 -- Reference to the author user

  -- Timestamps
  createdAt TIMESTAMPTZ DEFAULT NOW(),
  updatedAt TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_posts_slug ON posts(slug);
CREATE INDEX idx_posts_author ON posts(authorId);
CREATE INDEX idx_posts_published ON posts(published);
CREATE INDEX idx_posts_created_at ON posts(createdAt DESC);
CREATE INDEX idx_posts_tags ON posts USING GIN(tags);


-- ====================
-- HOW THE ADAPTER MAPS CONTENT
-- ====================

-- The duospace-supabase adapter transforms the Content object as follows:
--
-- Content.title           → posts.title
-- (generated slug)        → posts.slug
-- Content.body            → posts.content (HTML)
-- (first 160 chars)       → posts.excerpt
-- (same as excerpt)       → posts.metaDescription
-- Content.images[0].url   → posts.featuredImage
-- Content.metadata.tags   → posts.tags
-- (hardcoded true)        → posts.published
-- (from authConfig)       → posts.authorId


-- ====================
-- EXAMPLE QUERY USAGE
-- ====================

-- Fetch all published posts
SELECT * FROM posts WHERE published = true ORDER BY createdAt DESC;

-- Fetch posts by author
SELECT * FROM posts WHERE authorId = 'user-xxx' ORDER BY createdAt DESC;

-- Fetch posts by tag
SELECT * FROM posts WHERE 'technology' = ANY(tags);

-- Search posts by title or content
SELECT * FROM posts WHERE
  title ILIKE '%search term%' OR
  content ILIKE '%search term%'
ORDER BY createdAt DESC;


-- ====================
-- ADAPTER BEHAVIOR NOTES
-- ====================

-- Slug Generation:
-- - Converts title to lowercase
-- - Replaces spaces with hyphens
-- - Removes special characters
-- - Example: "My Blog Post!" → "my-blog-post"

-- Duplicate Slug Handling:
-- - Checks if slug exists before inserting
-- - Appends numeric suffix if duplicate (my-post-1, my-post-2, etc.)
-- - Falls back to timestamp if >100 attempts

-- Excerpt/Meta Description:
-- - Strips HTML tags from content
-- - Takes first 160 characters
-- - Adds "..." if truncated

-- Author ID:
-- - Uses authConfig.authorId if provided
-- - Falls back to default: "user-ad057dbc-fa5e-4990-88b1-de9afd25b592"


-- ====================
-- TROUBLESHOOTING
-- ====================

-- If posts aren't appearing after publish:
-- 1. Check if the insert succeeded (look for errors in logs)
-- 2. Verify authorId matches a valid user in DuoSpace
-- 3. Check if published is set to true
-- 4. Verify slug is unique (no constraint violations)

-- If you get "Failed to access DuoSpace posts table" error:
-- 1. Verify supabaseUrl is correct
-- 2. Ensure supabaseKey has write access to the posts table
-- 3. Check Row Level Security (RLS) policies aren't blocking inserts
-- 4. Confirm the table name is exactly "posts" (case-sensitive)
