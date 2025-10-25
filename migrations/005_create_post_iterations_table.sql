-- Create post_iterations table for storing iterative content improvements
-- This table tracks each iteration of content generation with quality scores

CREATE TABLE IF NOT EXISTS post_iterations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  iteration_number INTEGER NOT NULL CHECK (iteration_number > 0 AND iteration_number <= 10),
  content_json JSONB NOT NULL,
  quality_score DECIMAL(3, 1) NOT NULL CHECK (quality_score >= 1.0 AND quality_score <= 10.0),
  quality_feedback TEXT NOT NULL,
  word_count INTEGER NOT NULL CHECK (word_count >= 0),
  structure_score DECIMAL(3, 1) NOT NULL CHECK (structure_score >= 1.0 AND structure_score <= 10.0),
  depth_score DECIMAL(3, 1) NOT NULL CHECK (depth_score >= 1.0 AND depth_score <= 10.0),
  engagement_score DECIMAL(3, 1) NOT NULL CHECK (engagement_score >= 1.0 AND engagement_score <= 10.0),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Ensure unique iteration numbers per post
  UNIQUE (post_id, iteration_number)
);

-- Index for efficient queries by post_id
CREATE INDEX idx_post_iterations_post_id ON post_iterations(post_id);

-- Index for querying by quality score
CREATE INDEX idx_post_iterations_quality_score ON post_iterations(quality_score);

-- Index for sorting by iteration number
CREATE INDEX idx_post_iterations_iteration_number ON post_iterations(post_id, iteration_number);

-- Comments for documentation
COMMENT ON TABLE post_iterations IS 'Stores each iteration of content generation with quality ratings';
COMMENT ON COLUMN post_iterations.iteration_number IS 'Sequential iteration number (1-4 typically)';
COMMENT ON COLUMN post_iterations.quality_score IS 'Overall quality score from 1-10';
COMMENT ON COLUMN post_iterations.quality_feedback IS 'Detailed AI feedback on content quality';
COMMENT ON COLUMN post_iterations.word_count IS 'Number of words in the content body';
COMMENT ON COLUMN post_iterations.structure_score IS 'Score for content structure (intro, body, conclusion)';
COMMENT ON COLUMN post_iterations.depth_score IS 'Score for content depth and research quality';
COMMENT ON COLUMN post_iterations.engagement_score IS 'Score for reader engagement and readability';
