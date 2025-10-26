-- Add multilingual support to projects and posts tables
-- Enables native content generation in 50+ languages with SEO localization

-- Add language columns to projects table
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS language VARCHAR(10) DEFAULT 'en',
ADD COLUMN IF NOT EXISTS language_config JSONB DEFAULT '{}';

-- Add language column to posts table
ALTER TABLE posts
ADD COLUMN IF NOT EXISTS language VARCHAR(10);

-- Create index for faster language-based queries
CREATE INDEX IF NOT EXISTS idx_posts_language ON posts(language);
CREATE INDEX IF NOT EXISTS idx_projects_language ON projects(language);

-- Add comments for documentation
COMMENT ON COLUMN projects.language IS 'ISO 639-1 language code (en, es, fr, ja, ar, etc.). Determines the language for all content generation in this project.';
COMMENT ON COLUMN projects.language_config IS 'Additional language settings: regionalVariant (e.g., es-MX), scriptDirection (ltr/rtl), culturalContext, seoStrategy';
COMMENT ON COLUMN posts.language IS 'Language this post was generated in. Inherited from project.language but stored for analytics.';

-- Update existing projects to have default language 'en'
UPDATE projects SET language = 'en' WHERE language IS NULL;

-- Create trigger to auto-populate post language from project
CREATE OR REPLACE FUNCTION set_post_language()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.language IS NULL THEN
    NEW.language := (SELECT language FROM projects WHERE id = NEW.project_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_posts_language
  BEFORE INSERT ON posts
  FOR EACH ROW
  EXECUTE FUNCTION set_post_language();

-- Example language_config for different use cases:
-- Spanish (Latin America): {"regionalVariant": "es-MX", "scriptDirection": "ltr", "culturalContext": "Latin American", "seoStrategy": {"localizedKeywords": true, "hrefLangTags": true}}
-- Arabic: {"regionalVariant": "ar-SA", "scriptDirection": "rtl", "culturalContext": "Middle Eastern", "seoStrategy": {"localizedKeywords": true, "hrefLangTags": true}}
-- Japanese: {"regionalVariant": "ja-JP", "scriptDirection": "ltr", "culturalContext": "Japanese", "seoStrategy": {"localizedKeywords": true, "hrefLangTags": true}}
