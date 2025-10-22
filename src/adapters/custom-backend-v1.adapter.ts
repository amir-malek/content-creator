// Custom Backend V1 Adapter - Example implementation for a custom API

import { BasePublisherAdapter } from './base.adapter.js';
import { Content, ProjectConfig, PublishResult, MediaFile } from '../types/index.js';

/**
 * Example adapter for a custom backend API
 * This demonstrates how to create a platform-specific adapter
 *
 * Expected project config:
 * {
 *   platformType: 'custom-backend-v1',
 *   endpoints: {
 *     auth: 'https://api.example.com/auth',
 *     publish: 'https://api.example.com/posts',
 *     media: 'https://api.example.com/upload'
 *   },
 *   authConfig: {
 *     token: 'your-api-token',
 *     tokenExpiry: '2025-12-31T23:59:59Z'
 *   },
 *   parameters: {
 *     headers: { 'X-Custom-Header': 'value' },
 *     defaultCategory: 'blog',
 *     defaultStatus: 'published'
 *   }
 * }
 */
export default class CustomBackendV1Adapter extends BasePublisherAdapter {
  private accessToken?: string;

  constructor(config: ProjectConfig) {
    super(config);
  }

  /**
   * Authenticate with the custom backend
   * This example assumes token-based authentication
   */
  async authenticate(): Promise<void> {
    try {
      this.log('info', 'Authenticating with custom backend');

      // Check if we have a valid token in config
      const { token, tokenExpiry } = this.config.authConfig;

      if (token && tokenExpiry) {
        const expiry = new Date(tokenExpiry);
        if (expiry > new Date()) {
          // Token is still valid
          this.accessToken = token;
          this.authenticated = true;
          this.log('info', 'Using existing valid token');
          return;
        }
      }

      // If auth endpoint exists, try to get a new token
      if (this.config.endpoints.auth) {
        const response = await this.httpClient.post<{ token: string; expiresAt: string }>(
          this.getEndpointUrl('auth'),
          {
            apiKey: this.config.authConfig.apiKey || token,
          }
        );

        this.accessToken = response.data.token;
      } else {
        // No auth endpoint, use token directly
        this.accessToken = token;
      }

      // Set authorization header for future requests
      this.httpClient.defaults.headers.common['Authorization'] = `Bearer ${this.accessToken}`;

      this.authenticated = true;
      this.log('info', 'Authentication successful');
    } catch (error) {
      this.log('error', 'Authentication failed', error);
      throw new Error(`Authentication failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Publish content to the custom backend
   */
  async publish(content: Content, _config: ProjectConfig): Promise<PublishResult> {
    try {
      // Validate content
      this.validateContent(content);

      this.log('info', `Publishing: ${content.title}`);

      // Transform platform-agnostic content to custom backend format
      const payload = this.transformContent(content);

      // Make publish request
      const response = await this.makeRequest<{ id: string; url: string; status: string }>(
        'POST',
        'publish',
        payload
      );

      this.log('info', `Published successfully: ${response.url}`);

      return this.createSuccessResult(response.url, `Post published with ID: ${response.id}`);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Upload media to the custom backend
   */
  async uploadMedia(media: MediaFile): Promise<string> {
    try {
      this.log('info', `Uploading media: ${media.filename}`);

      // Create form data
      const formData = new FormData();
      const blob = new Blob([media.buffer], { type: media.mimetype });
      formData.append('file', blob, media.filename);

      // Upload media
      const response = await this.makeRequest<{ url: string }>(
        'POST',
        'media',
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        }
      );

      this.log('info', `Media uploaded: ${response.url}`);

      return response.url;
    } catch (error) {
      this.log('error', 'Media upload failed', error);
      throw new Error(`Media upload failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Transform platform-agnostic content to custom backend format
   */
  private transformContent(content: Content): any {
    return {
      title: content.title,
      content: this.formatBody(content, 'html'),
      excerpt: this.generateExcerpt(content.body),
      featuredImage: content.images[0]?.url || null,
      images: content.images.map((img) => ({
        url: img.url,
        alt: img.alt,
        caption: img.caption,
      })),
      tags: content.metadata.tags,
      categories: content.metadata.categories || [this.config.parameters?.defaultCategory],
      publishDate: content.metadata.publishDate.toISOString(),
      status: this.config.parameters?.defaultStatus || 'published',
      customFields: content.metadata.customFields || {},
    };
  }

  /**
   * Generate an excerpt from the content body
   */
  private generateExcerpt(body: string, maxLength: number = 160): string {
    // Remove HTML tags
    const text = body.replace(/<[^>]*>/g, '');

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
