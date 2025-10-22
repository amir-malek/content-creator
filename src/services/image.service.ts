// Image Service - Search and select images using Unsplash

import { createApi } from 'unsplash-js';
import { Image, Content } from '../types/index.js';

/**
 * Image service for finding relevant images using Unsplash API
 * Uses free tier - provides high-quality royalty-free images
 */
export class ImageService {
  private unsplash: ReturnType<typeof createApi>;

  constructor(accessKey: string) {
    if (!accessKey) {
      throw new Error('Unsplash access key is required');
    }

    this.unsplash = createApi({
      accessKey,
    });
  }

  /**
   * Search for relevant images based on post content
   * @param title Post title
   * @param fieldNiche Topic area or niche
   * @param keywords Additional keywords
   * @param count Number of images to return (default: 3)
   * @returns Array of image objects with URLs and metadata
   */
  async searchImages(
    title: string,
    fieldNiche?: string,
    keywords?: string[],
    count: number = 3
  ): Promise<Image[]> {
    try {
      // Build search query
      const query = this.buildImageQuery(title, fieldNiche, keywords);

      console.log(`[Image Service] Searching for images: ${query}`);

      // Search Unsplash
      const result = await this.unsplash.search.getPhotos({
        query,
        page: 1,
        perPage: Math.min(count * 2, 20), // Get more results to filter from
        orientation: 'landscape', // Better for blog posts
      });

      if (result.errors) {
        throw new Error(`Unsplash API error: ${result.errors.join(', ')}`);
      }

      if (!result.response || result.response.results.length === 0) {
        console.warn('[Image Service] No images found, trying fallback search');
        return this.fallbackSearch(fieldNiche || 'blog', count);
      }

      // Select and format the best images
      const images = result.response.results
        .slice(0, count)
        .map((photo) => this.formatImage(photo, title));

      console.log(`[Image Service] Found ${images.length} images`);

      return images;
    } catch (error) {
      console.error('[Image Service] Search failed:', error);

      // Return empty array instead of failing completely
      // This allows content generation to continue without images
      console.warn('[Image Service] Continuing without images');
      return [];
    }
  }

  /**
   * Add images to existing content
   * @param content Content to enhance with images
   * @param imageCount Number of images to add (default: 3)
   * @returns Content with images added
   */
  async enhanceContentWithImages(content: Content, imageCount: number = 3): Promise<Content> {
    try {
      // Search for images
      const images = await this.searchImages(
        content.title,
        content.metadata.customFields?.fieldNiche,
        content.metadata.tags,
        imageCount
      );

      // Update content with images
      return {
        ...content,
        images,
      };
    } catch (error) {
      console.error('[Image Service] Failed to enhance content with images:', error);
      // Return original content if image enhancement fails
      return content;
    }
  }

  /**
   * Build image search query from post information
   */
  private buildImageQuery(title: string, fieldNiche?: string, keywords?: string[]): string {
    const parts: string[] = [];

    // Add field/niche (most relevant)
    if (fieldNiche) {
      parts.push(fieldNiche);
    }

    // Add first 2 keywords
    if (keywords && keywords.length > 0) {
      parts.push(...keywords.slice(0, 2));
    }

    // Add a term from the title (first meaningful word)
    const titleWords = title
      .split(' ')
      .filter((w) => w.length > 4 && !['the', 'and', 'for', 'with'].includes(w.toLowerCase()));

    if (titleWords.length > 0) {
      parts.push(titleWords[0]);
    }

    return parts.join(' ') || 'blog technology';
  }

  /**
   * Format Unsplash photo into our Image type
   */
  private formatImage(photo: any, contextTitle: string): Image {
    return {
      url: photo.urls.regular, // High-quality URL
      alt: photo.alt_description || photo.description || `Image for ${contextTitle}`,
      caption: photo.description || undefined,
    };
  }

  /**
   * Fallback search with generic term
   */
  private async fallbackSearch(term: string, count: number): Promise<Image[]> {
    try {
      const result = await this.unsplash.search.getPhotos({
        query: term,
        page: 1,
        perPage: count,
        orientation: 'landscape',
      });

      if (result.errors || !result.response) {
        return [];
      }

      return result.response.results.slice(0, count).map((photo) => this.formatImage(photo, term));
    } catch (error) {
      console.error('[Image Service] Fallback search failed:', error);
      return [];
    }
  }

  /**
   * Get a single featured image for a post
   * @param title Post title
   * @param fieldNiche Topic area
   * @returns Single featured image
   */
  async getFeaturedImage(title: string, fieldNiche?: string): Promise<Image | null> {
    const images = await this.searchImages(title, fieldNiche, undefined, 1);
    return images.length > 0 ? images[0] : null;
  }

  /**
   * Get collection of images by theme
   * Useful for generating consistent visual style across posts
   */
  async getImagesByTheme(theme: string, count: number = 5): Promise<Image[]> {
    try {
      const result = await this.unsplash.search.getPhotos({
        query: theme,
        page: 1,
        perPage: count,
        orientation: 'landscape',
      });

      if (result.errors || !result.response) {
        return [];
      }

      return result.response.results.map((photo) => this.formatImage(photo, theme));
    } catch (error) {
      console.error('[Image Service] Theme search failed:', error);
      return [];
    }
  }

  /**
   * Download trigger for Unsplash (required by their API terms)
   * Call this when an image is actually published
   */
  async triggerDownload(downloadLink: string): Promise<void> {
    try {
      // Unsplash requires us to trigger their download endpoint
      // This is for their analytics
      await this.unsplash.photos.trackDownload({
        downloadLocation: downloadLink,
      });
    } catch (error) {
      // Non-critical, just log
      console.warn('[Image Service] Download trigger failed:', error);
    }
  }
}
