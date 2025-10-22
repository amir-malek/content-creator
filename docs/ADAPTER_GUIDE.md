# Platform Adapter Creation Guide

This guide explains how to create custom platform adapters for publishing content to any platform with an API.

## Overview

The Content Creator system uses a **dynamic adapter pattern** to support publishing to any platform. Each adapter is a TypeScript class that implements the `IPublisher` interface and handles platform-specific logic.

## Architecture

### Platform-Agnostic Content Format

All content is generated in a standardized format:

```typescript
interface Content {
  title: string;
  body: string; // markdown or HTML
  images: Array<{
    url: string;
    alt: string;
    caption?: string;
  }>;
  metadata: {
    tags: string[];
    categories?: string[];
    publishDate: Date;
    customFields?: Record<string, any>;
  };
}
```

### IPublisher Interface

Every adapter must implement this interface:

```typescript
interface IPublisher {
  // Authenticate with the platform
  authenticate(): Promise<void>;

  // Publish content to the platform
  publish(content: Content, config: ProjectConfig): Promise<PublishResult>;

  // Optional: Upload media to the platform
  uploadMedia?(media: MediaFile): Promise<string>;
}
```

## Creating a Custom Adapter

### Step 1: Create Adapter File

Create a new file in `src/adapters/` with the format: `{platform-type}.adapter.ts`

Example: `src/adapters/wordpress.adapter.ts` for WordPress

### Step 2: Extend BasePublisherAdapter

```typescript
import { BasePublisherAdapter } from './base.adapter.js';
import { Content, ProjectConfig, PublishResult } from '../types/index.js';

export default class WordpressAdapter extends BasePublisherAdapter {
  constructor(config: ProjectConfig) {
    super(config);
  }

  async authenticate(): Promise<void> {
    // Implement authentication logic
  }

  async publish(content: Content, config: ProjectConfig): Promise<PublishResult> {
    // Implement publishing logic
  }
}
```

### Step 3: Implement Authentication

The `authenticate()` method should:
- Validate credentials from `config.authConfig`
- Obtain access tokens if needed
- Set up authentication headers
- Mark `this.authenticated = true` on success

Example:

```typescript
async authenticate(): Promise<void> {
  try {
    this.log('info', 'Authenticating with WordPress');

    const { username, password, appPassword } = this.config.authConfig;

    // WordPress uses Basic Auth with application passwords
    const credentials = Buffer.from(`${username}:${appPassword}`).toString('base64');

    this.httpClient.defaults.headers.common['Authorization'] = `Basic ${credentials}`;

    // Test authentication
    await this.httpClient.get(this.getEndpointUrl('auth'));

    this.authenticated = true;
    this.log('info', 'Authentication successful');
  } catch (error) {
    throw new Error(`Authentication failed: ${error.message}`);
  }
}
```

### Step 4: Implement Publishing

The `publish()` method should:
- Validate content using `this.validateContent(content)`
- Transform platform-agnostic content to platform format
- Make API call to publish
- Return `PublishResult` with success status and URL

Example:

```typescript
async publish(content: Content, config: ProjectConfig): Promise<PublishResult> {
  try {
    this.validateContent(content);
    this.log('info', `Publishing: ${content.title}`);

    // Transform to WordPress format
    const wpPost = {
      title: content.title,
      content: this.formatBody(content, 'html'),
      excerpt: this.generateExcerpt(content.body),
      status: 'publish',
      categories: this.getCategoryIds(content.metadata.categories),
      tags: this.getTagIds(content.metadata.tags),
      featured_media: await this.uploadFeaturedImage(content.images[0]),
    };

    // Publish to WordPress
    const response = await this.makeRequest('POST', 'publish', wpPost);

    return this.createSuccessResult(
      response.link,
      `Post published with ID: ${response.id}`
    );
  } catch (error) {
    return this.handleError(error);
  }
}
```

### Step 5: Optional - Implement Media Upload

If your platform requires media upload:

```typescript
async uploadMedia(media: MediaFile): Promise<string> {
  try {
    const formData = new FormData();
    formData.append('file', media.buffer, media.filename);

    const response = await this.makeRequest('POST', 'media', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });

    return response.source_url;
  } catch (error) {
    throw new Error(`Media upload failed: ${error.message}`);
  }
}
```

## Project Configuration

When creating a project in the database, specify:

```sql
INSERT INTO projects (name, platform_type, endpoints, auth_config, parameters, style_config)
VALUES (
  'My WordPress Blog',
  'wordpress',  -- Must match adapter filename without .adapter.ts
  '{
    "auth": "https://example.com/wp-json/wp/v2/users/me",
    "publish": "https://example.com/wp-json/wp/v2/posts",
    "media": "https://example.com/wp-json/wp/v2/media"
  }',
  '{
    "username": "your-username",
    "appPassword": "your-app-password"
  }',
  '{
    "defaultStatus": "publish",
    "defaultCategory": 1
  }',
  '{
    "tone": "professional",
    "length": "medium",
    "includeImages": true
  }'
);
```

### Configuration Fields

**endpoints** (JSON):
- Key-value pairs of endpoint names to URLs
- Commonly used: `auth`, `publish`, `media`, `categories`, `tags`

**auth_config** (JSON):
- Platform-specific authentication details
- Examples: tokens, API keys, username/password, OAuth credentials
- Handled securely - never logged

**parameters** (JSON):
- Platform-specific options
- Examples: default status, categories, custom headers
- Accessible via `this.config.parameters` in adapter

**style_config** (JSON):
- Content generation preferences
- Used by content generation service
- Examples: tone, length, custom instructions

## Helper Methods from BasePublisherAdapter

The base class provides useful helpers:

### HTTP Requests

```typescript
// Make authenticated API request
protected async makeRequest<T>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  endpoint: string,
  data?: any,
  additionalConfig?: AxiosRequestConfig
): Promise<T>

// Get full URL for an endpoint key
protected getEndpointUrl(endpointKey: string): string
```

### Content Helpers

```typescript
// Format body content
protected formatBody(content: Content, format: 'markdown' | 'html'): string

// Extract image URLs
protected getImageUrls(content: Content): string[]

// Validate content
protected validateContent(content: Content): void
```

### Result Helpers

```typescript
// Create success result
protected createSuccessResult(url: string, message?: string): PublishResult

// Handle error and create result
protected handleError(error: unknown): PublishResult
```

### Logging

```typescript
// Log messages (writes to console and can be extended to write to DB)
protected log(level: 'info' | 'error' | 'debug', message: string, metadata?: any): void
```

### Utilities

```typescript
// Sleep utility for rate limiting
protected async sleep(ms: number): Promise<void>
```

## Complete Example: Ghost CMS Adapter

```typescript
import { BasePublisherAdapter } from './base.adapter.js';
import { Content, ProjectConfig, PublishResult } from '../types/index.js';
import jwt from 'jsonwebtoken';

export default class GhostAdapter extends BasePublisherAdapter {
  private adminApiKey?: string;

  async authenticate(): Promise<void> {
    try {
      this.log('info', 'Authenticating with Ghost');

      const { adminApiKey } = this.config.authConfig;
      this.adminApiKey = adminApiKey;

      // Ghost uses JWT tokens
      const [id, secret] = adminApiKey.split(':');
      const token = jwt.sign({}, Buffer.from(secret, 'hex'), {
        keyid: id,
        algorithm: 'HS256',
        expiresIn: '5m',
        audience: '/admin/',
      });

      this.httpClient.defaults.headers.common['Authorization'] = `Ghost ${token}`;

      this.authenticated = true;
      this.log('info', 'Authentication successful');
    } catch (error) {
      throw new Error(`Ghost authentication failed: ${error.message}`);
    }
  }

  async publish(content: Content, config: ProjectConfig): Promise<PublishResult> {
    try {
      this.validateContent(content);
      this.log('info', `Publishing to Ghost: ${content.title}`);

      // Transform to Ghost format
      const ghostPost = {
        posts: [
          {
            title: content.title,
            html: this.formatBody(content, 'html'),
            tags: content.metadata.tags.map((tag) => ({ name: tag })),
            status: 'published',
            featured: true,
            feature_image: content.images[0]?.url,
          },
        ],
      };

      // Publish to Ghost
      const response = await this.makeRequest('POST', 'publish', ghostPost);

      return this.createSuccessResult(
        response.posts[0].url,
        `Post published: ${response.posts[0].id}`
      );
    } catch (error) {
      return this.handleError(error);
    }
  }
}
```

## Testing Your Adapter

### 1. Create Test Project

```sql
INSERT INTO projects (name, platform_type, endpoints, auth_config, parameters)
VALUES (
  'Test Project',
  'your-platform',
  '{"publish": "https://api.example.com/posts"}',
  '{"token": "test-token"}',
  '{}'
);
```

### 2. Create Test Post

```sql
INSERT INTO posts (project_id, title, field_niche, keywords, publish_date)
VALUES (
  (SELECT id FROM projects WHERE name = 'Test Project'),
  'Test Post',
  'Testing',
  ARRAY['test'],
  CURRENT_DATE
);
```

### 3. Run Dry Run

```bash
npm run cli publish --project "Test Project" --dry-run
```

### 4. Verify Content

Check the `posts` table for `content_json` field to see generated content.

### 5. Test Publishing

```bash
npm run cli publish --project "Test Project"
```

## Best Practices

1. **Error Handling**: Always wrap API calls in try-catch and use `handleError()`
2. **Logging**: Use `this.log()` for important operations
3. **Validation**: Call `validateContent()` before transforming
4. **Authentication**: Check token expiry and refresh if needed
5. **Rate Limiting**: Use `this.sleep()` if platform has rate limits
6. **Idempotency**: Check if content already exists before publishing
7. **Testing**: Always test with dry-run first

## Common Platform Examples

### WordPress
- Authentication: Basic Auth with Application Passwords
- Endpoint: `/wp-json/wp/v2/posts`
- Format: REST API with JSON

### Ghost
- Authentication: JWT with Admin API Key
- Endpoint: `/ghost/api/admin/posts`
- Format: JSON with posts array

### Medium
- Authentication: OAuth Bearer Token
- Endpoint: `/v1/users/{userId}/posts`
- Format: JSON with custom fields

### Contentful
- Authentication: Bearer Token
- Endpoint: `/spaces/{space}/entries`
- Format: JSON with content modeling

### Custom Headless CMS
- Varies by implementation
- Usually REST or GraphQL
- Refer to platform documentation

## Troubleshooting

### Adapter Not Loading
- Ensure filename matches pattern: `{platform-type}.adapter.ts`
- Check that class is exported as default
- Verify TypeScript compilation succeeded

### Authentication Failures
- Log full error with `this.log('error', message, error)`
- Check credentials in database
- Test API endpoints manually with curl/Postman

### Publishing Failures
- Check `logs` table for error details
- Verify endpoint URLs are correct
- Ensure content format matches platform requirements
- Test with minimal content first

## Resources

- [Base Adapter Source](../src/adapters/base.adapter.ts)
- [Example Adapter](../src/adapters/custom-backend-v1.adapter.ts)
- [Type Definitions](../src/types/index.ts)
- Platform API documentation (varies by platform)
