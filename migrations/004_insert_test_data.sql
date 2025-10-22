-- Insert a test project
INSERT INTO projects (name, platform_type, endpoints, auth_config, parameters, style_config)
VALUES (
  'Test Blog',
  'custom-backend-v1',
  '{"publish": "https://httpbin.org/post", "auth": "https://httpbin.org/post"}',
  '{"token": "test-token-123", "tokenExpiry": "2025-12-31T23:59:59Z"}',
  '{"headers": {"X-Test": "true"}, "defaultCategory": "blog", "defaultStatus": "published"}',
  '{"tone": "professional", "length": "medium", "includeImages": true, "customInstructions": "Focus on practical examples and actionable insights."}'
)
ON CONFLICT (name) DO NOTHING;

-- Insert a test post for today
INSERT INTO posts (
  project_id,
  title,
  field_niche,
  keywords,
  publish_date,
  status
)
VALUES (
  (SELECT id FROM projects WHERE name = 'Test Blog' LIMIT 1),
  'The Future of AI in Web Development',
  'Web Development',
  ARRAY['AI', 'artificial intelligence', 'web development', 'automation', 'machine learning'],
  CURRENT_DATE,
  'pending'
)
ON CONFLICT DO NOTHING;

-- Verify data was inserted
SELECT
  'Projects created:' as info,
  COUNT(*) as count
FROM projects;

SELECT
  'Posts created:' as info,
  COUNT(*) as count
FROM posts;
