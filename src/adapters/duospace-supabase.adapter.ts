// DuoSpace Supabase Adapter - Direct database publishing to DuoSpace's Supabase

import { randomUUID } from 'crypto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { BasePublisherAdapter } from './base.adapter.js';
import { Content, ProjectConfig, PublishResult } from '../types/index.js';

/**
 * DuoSpace Supabase Adapter - Publishes directly to DuoSpace's Supabase database
 *
 * This adapter encapsulates all DuoSpace-specific configuration:
 * - Table name: "posts"
 * - Column schema matching DuoSpace's database
 * - Automatic slug generation and duplicate handling
 * - DuoSpace-specific field transformations
 *
 * Required config (stored in database):
 * {
 *   platformType: 'duospace-supabase',
 *   authConfig: {
 *     supabaseUrl: 'https://xxx.supabase.co',
 *     supabaseKey: 'service_role_key',
 *     authorId: 'user-xxx' // Optional, defaults to system user
 *   }
 * }
 *
 * No endpoints or parameters needed - everything is hardcoded!
 */
export default class DuospaceSupabaseAdapter extends BasePublisherAdapter {
  private supabaseClient?: SupabaseClient;

  // Hardcoded DuoSpace configuration
  private readonly TABLE_NAME = 'posts';
  private readonly DEFAULT_AUTHOR_ID = 'user-ad057dbc-fa5e-4990-88b1-de9afd25b592';

  constructor(config: ProjectConfig) {
    super(config);
  }

  /**
   * Authenticate with DuoSpace's Supabase database
   */
  async authenticate(): Promise<void> {
    try {
      this.log('info', 'Authenticating with DuoSpace Supabase');

      // Validate configuration
      const { supabaseUrl, supabaseKey } = this.config.authConfig;

      if (!supabaseUrl || !supabaseKey) {
        throw new Error('Missing required auth config: supabaseUrl and supabaseKey are required');
      }

      // Create Supabase client
      this.supabaseClient = createClient(supabaseUrl, supabaseKey);

      // Validate that the posts table exists
      const { error: testError } = await this.supabaseClient
        .from(this.TABLE_NAME)
        .select('id')
        .limit(1);

      if (testError) {
        throw new Error(`Failed to access DuoSpace posts table: ${testError.message}`);
      }

      this.authenticated = true;
      this.log('info', 'Successfully connected to DuoSpace Supabase');
    } catch (error) {
      this.log('error', 'Authentication failed', error);
      throw new Error(`DuoSpace Supabase authentication failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Publish content to DuoSpace's posts table
   */
  async publish(content: Content, _config: ProjectConfig): Promise<PublishResult> {
    try {
      // Validate content
      this.validateContent(content);

      if (!this.supabaseClient) {
        throw new Error('Not authenticated - call authenticate() first');
      }

      this.log('info', `Publishing to DuoSpace: ${content.title}`);

      // Generate slug from title
      const slug = this.generateSlug(content.title);

      // Check if slug already exists and make it unique if needed
      const uniqueSlug = await this.ensureUniqueSlug(slug);

      // Transform content to DuoSpace schema
      const payload = this.transformToDuoSpaceSchema(content, uniqueSlug);

      // Insert into DuoSpace posts table
      const { data, error } = await this.supabaseClient
        .from(this.TABLE_NAME)
        .insert(payload)
        .select('id, slug')
        .single();

      if (error) {
        throw new Error(`Failed to insert post: ${error.message}`);
      }

      this.log('info', `Published successfully - ID: ${data.id}, Slug: ${data.slug}`);

      // Return the slug as the published URL
      return this.createSuccessResult(
        data.slug,
        `Post published to DuoSpace with ID: ${data.id}`
      );
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Transform Content to DuoSpace's posts table schema
   */
  private transformToDuoSpaceSchema(content: Content, slug: string): Record<string, any> {
    const authorId = this.config.authConfig.authorId || this.DEFAULT_AUTHOR_ID;
    const now = new Date().toISOString();

    return {
      id: randomUUID(), // Generate UUID for the post
      title: content.title,
      slug: slug,
      content: this.formatBody(content, 'html'),
      excerpt: this.generateExcerpt(content.body),
      metaDescription: this.generateExcerpt(content.body),
      featuredImage: content.images[0]?.url || null,
      tags: content.metadata.tags || [],
      published: true,
      authorId: authorId,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Generate a URL-friendly slug from a title
   */
  private generateSlug(title: string): string {
    return title
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '') // Remove special characters
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
      .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
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

    return lastSpace > 0
      ? truncated.substring(0, lastSpace) + '...'
      : truncated + '...';
  }

  /**
   * Ensure the slug is unique by checking the database and adding a suffix if needed
   */
  private async ensureUniqueSlug(slug: string): Promise<string> {
    if (!this.supabaseClient) {
      throw new Error('Supabase client not initialized');
    }

    let uniqueSlug = slug;
    let suffix = 1;

    // Check if slug exists
    while (true) {
      const { data, error } = await this.supabaseClient
        .from(this.TABLE_NAME)
        .select('slug')
        .eq('slug', uniqueSlug)
        .limit(1);

      if (error) {
        this.log('info', `Failed to check slug uniqueness: ${error.message}`, { slug: uniqueSlug });
        // If we can't check, proceed with the slug
        break;
      }

      if (!data || data.length === 0) {
        // Slug is unique
        break;
      }

      // Slug exists, try with suffix
      uniqueSlug = `${slug}-${suffix}`;
      suffix++;

      // Prevent infinite loop
      if (suffix > 100) {
        this.log('info', 'Reached maximum slug generation attempts', { originalSlug: slug });
        uniqueSlug = `${slug}-${Date.now()}`;
        break;
      }
    }

    return uniqueSlug;
  }
}
