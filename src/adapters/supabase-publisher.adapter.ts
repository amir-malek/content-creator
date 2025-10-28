// Supabase Publisher Adapter - Publish directly to any Supabase database table

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { BasePublisherAdapter } from './base.adapter.js';
import { Content, ProjectConfig, PublishResult } from '../types/index.js';

/**
 * Supabase Publisher Adapter - Publishes content directly to a Supabase table
 *
 * Expected project config:
 * {
 *   platformType: 'supabase-publisher',
 *   endpoints: {
 *     table: 'blog_posts'  // Target table name
 *   },
 *   authConfig: {
 *     supabaseUrl: 'https://xxx.supabase.co',
 *     supabaseKey: 'service_role_key_here'
 *   },
 *   parameters: {
 *     columnMapping: {
 *       title: 'post_title',      // Maps Content.title to table column
 *       body: 'content_html',      // Maps Content.body to table column
 *       slug: 'slug',              // Maps generated slug to table column
 *       images: 'featured_images', // Maps Content.images to table column
 *       metadata: 'meta'           // Maps Content.metadata to table column
 *     },
 *     generateSlugFromColumn: 'title' // Which field to use for slug generation (default: 'title')
 *   }
 * }
 */
export default class SupabasePublisherAdapter extends BasePublisherAdapter {
  private supabaseClient?: SupabaseClient;
  private tableName?: string;
  private columnMapping: Record<string, string>;

  constructor(config: ProjectConfig) {
    super(config);

    // Get column mapping from config or use defaults
    this.columnMapping = config.parameters?.columnMapping || {
      title: 'title',
      body: 'body',
      slug: 'slug',
      images: 'images',
      metadata: 'metadata',
    };
  }

  /**
   * Authenticate with Supabase and validate configuration
   */
  async authenticate(): Promise<void> {
    try {
      this.log('info', 'Authenticating with Supabase');

      // Validate configuration
      const { supabaseUrl, supabaseKey } = this.config.authConfig;

      if (!supabaseUrl || !supabaseKey) {
        throw new Error('Missing required auth config: supabaseUrl and supabaseKey are required');
      }

      // Get table name from endpoints
      this.tableName = this.config.endpoints.table;
      if (!this.tableName) {
        throw new Error('Missing required endpoint: table name is required in endpoints.table');
      }

      // Create Supabase client
      this.supabaseClient = createClient(supabaseUrl, supabaseKey);

      // Validate that the table exists by attempting a simple query
      const { error: testError } = await this.supabaseClient
        .from(this.tableName)
        .select('*')
        .limit(1);

      if (testError) {
        throw new Error(`Failed to access table "${this.tableName}": ${testError.message}`);
      }

      this.authenticated = true;
      this.log('info', `Authentication successful - connected to table: ${this.tableName}`);
    } catch (error) {
      this.log('error', 'Authentication failed', error);
      throw new Error(`Supabase authentication failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Publish content to the Supabase table
   */
  async publish(content: Content, _config: ProjectConfig): Promise<PublishResult> {
    try {
      // Validate content
      this.validateContent(content);

      if (!this.supabaseClient || !this.tableName) {
        throw new Error('Not authenticated - call authenticate() first');
      }

      this.log('info', `Publishing to Supabase table "${this.tableName}": ${content.title}`);

      // Generate slug from title
      const slug = this.generateSlug(content.title);

      // Check if slug already exists and make it unique if needed
      const uniqueSlug = await this.ensureUniqueSlug(slug);

      // Transform content to match table schema with column mapping
      const payload = this.transformContentToTableRow(content, uniqueSlug);

      // Insert into Supabase table
      const { data: _data, error } = await this.supabaseClient
        .from(this.tableName)
        .insert(payload)
        .select('*')
        .single();

      if (error) {
        throw new Error(`Supabase insert failed: ${error.message}`);
      }

      this.log('info', `Published successfully with slug: ${uniqueSlug}`);

      // Return the slug as the "published URL"
      return this.createSuccessResult(
        uniqueSlug,
        `Content published to ${this.tableName} with slug: ${uniqueSlug}`
      );
    } catch (error) {
      return this.handleError(error);
    }
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
   * Ensure the slug is unique by checking the database and adding a suffix if needed
   */
  private async ensureUniqueSlug(slug: string): Promise<string> {
    if (!this.supabaseClient || !this.tableName) {
      throw new Error('Supabase client not initialized');
    }

    const slugColumn = this.columnMapping.slug || 'slug';
    let uniqueSlug = slug;
    let suffix = 1;

    // Check if slug exists
    while (true) {
      const { data, error } = await this.supabaseClient
        .from(this.tableName)
        .select(slugColumn)
        .eq(slugColumn, uniqueSlug)
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

  /**
   * Transform platform-agnostic Content to a table row using column mapping
   */
  private transformContentToTableRow(content: Content, slug: string): Record<string, any> {
    const row: Record<string, any> = {};

    // Map each field to its corresponding table column
    if (this.columnMapping.title) {
      row[this.columnMapping.title] = content.title;
    }

    if (this.columnMapping.body) {
      row[this.columnMapping.body] = this.formatBody(content, 'html');
    }

    if (this.columnMapping.slug) {
      row[this.columnMapping.slug] = slug;
    }

    if (this.columnMapping.images) {
      // Store images as JSONB array
      row[this.columnMapping.images] = content.images;
    }

    if (this.columnMapping.metadata) {
      // Store metadata as JSONB
      row[this.columnMapping.metadata] = {
        tags: content.metadata.tags,
        categories: content.metadata.categories || [],
        publishDate: content.metadata.publishDate.toISOString(),
        customFields: content.metadata.customFields || {},
        language: content.metadata.language || 'en',
        seoMetadata: content.metadata.seoMetadata || null,
      };
    }

    // Allow custom fields from metadata.customFields to be mapped directly
    if (content.metadata.customFields) {
      Object.keys(content.metadata.customFields).forEach((key) => {
        // Only add if there's a mapping for this custom field
        const mappedColumn = this.columnMapping[key];
        if (mappedColumn && !row[mappedColumn]) {
          row[mappedColumn] = content.metadata.customFields![key];
        }
      });
    }

    return row;
  }
}
