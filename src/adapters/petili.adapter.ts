// Petili Blog Adapter - Publishes content to petili.ir blog platform

import { BasePublisherAdapter } from './base.adapter.js';
import { Content, ProjectConfig, PublishResult } from '../types/index.js';

/**
 * Adapter for Petili blog platform (petili.ir)
 *
 * Expected project config:
 * {
 *   platformType: 'petili',
 *   endpoints: {
 *     publish: 'https://petili.ir/api/blog/create'
 *   },
 *   authConfig: {
 *     apiKey: 'your-api-key-here'
 *   },
 *   parameters: {
 *     author: {
 *       name: 'Author Name',           // Optional - defaults to 'پتیلی'
 *       picture: 'https://example.com/author.jpg'  // Optional - defaults to Petili logo
 *     }
 *   }
 * }
 */
export default class PetiliAdapter extends BasePublisherAdapter {
  constructor(config: ProjectConfig) {
    super(config);
  }

  /**
   * Authenticate with Petili API
   * Sets the X-API-Key header for all requests
   */
  async authenticate(): Promise<void> {
    try {
      this.log('info', 'Authenticating with Petili API');

      const apiKey = this.config.authConfig.apiKey;
      if (!apiKey) {
        throw new Error('API key is required in authConfig.apiKey');
      }

      // Set API key header for all future requests
      this.httpClient.defaults.headers.common['X-API-Key'] = apiKey;

      this.authenticated = true;
      this.log('info', 'Authentication successful - API key configured');
    } catch (error) {
      this.log('error', 'Authentication failed', error);
      throw new Error(`Authentication failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Publish content to Petili blog platform
   */
  async publish(content: Content, _config: ProjectConfig): Promise<PublishResult> {
    try {
      // Validate content
      this.validateContent(content);

      this.log('info', `Publishing to Petili: ${content.title}`);

      // Transform platform-agnostic content to Petili format
      const payload = this.transformContent(content);

      // Make publish request
      const response = await this.makeRequest<{
        success?: boolean;
        post?: { postId?: string; slug?: string; };
        url?: string;
      }>(
        'POST',
        'publish',
        payload
      );

      // Construct URL from response
      const slug = response.post?.slug || response.post?.postId || 'unknown';
      const publishedUrl = response.url || `https://petili.ir/posts/${slug}`;

      this.log('info', `Published successfully to Petili: ${publishedUrl}`);

      return this.createSuccessResult(publishedUrl, 'Post published to Petili successfully');
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Transform platform-agnostic content to Petili format
   */
  private transformContent(content: Content): any {
    // Get author info from parameters or use hardcoded default
    const author = this.config.parameters?.author || {
      name: 'پتیلی',
      picture: 'https://petili.ir/logo/logo-88x88.png'
    };

    // Generate excerpt from body if not provided
    const excerpt = this.generateExcerpt(content.body);

    // Get cover image (first image or placeholder)
    const coverImage = content.images[0]?.url || 'https://via.placeholder.com/1200x630';

    return {
      title: content.title,
      excerpt,
      content: content.body,
      coverImage,
      author: {
        name: author.name,
        picture: author.picture
      }
    };
  }

  /**
   * Generate an excerpt from the content body
   */
  private generateExcerpt(body: string, maxLength: number = 160): string {
    // Remove markdown/HTML formatting
    let text = body
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/[#*_~`]/g, '') // Remove markdown symbols
      .replace(/\n+/g, ' ') // Replace newlines with spaces
      .trim();

    // Truncate to maxLength
    if (text.length <= maxLength) {
      return text;
    }

    // Find last complete word within maxLength
    const truncated = text.substring(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');

    return lastSpace > 0 ? truncated.substring(0, lastSpace) + '...' : truncated + '...';
  }
}
