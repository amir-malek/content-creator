// Image Service - Search and select images using Unsplash

import { createApi } from 'unsplash-js';
import { Image, Content, ProjectConfig } from '../types/index.js';
import { S3Service } from './s3.service.js';

/**
 * Image service for finding relevant images using Unsplash API
 * Optionally uploads images to S3 for self-hosted storage
 * Uses free tier - provides high-quality royalty-free images
 */
export class ImageService {
  private unsplash: ReturnType<typeof createApi>;
  private s3Service: S3Service;

  constructor(accessKey: string, s3Service: S3Service) {
    if (!accessKey) {
      throw new Error('Unsplash access key is required');
    }

    this.unsplash = createApi({
      accessKey,
    });
    this.s3Service = s3Service;
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
   * Optionally uploads images to S3 if enabled for the project
   * @param content Content to enhance with images
   * @param imageCount Number of images to add (default: 3)
   * @param project Optional project config for S3 upload
   * @returns Content with images added (with S3 URLs if enabled)
   */
  async enhanceContentWithImages(
    content: Content,
    imageCount: number = 3,
    project?: ProjectConfig
  ): Promise<Content> {
    try {
      // Search for images from Unsplash
      const unsplashImages = await this.searchImages(
        content.title,
        content.metadata.customFields?.fieldNiche,
        content.metadata.tags,
        imageCount
      );

      // Check if S3 upload is enabled for this project
      const shouldUploadToS3 = project?.useS3ForImages && this.s3Service.isConfigured(project);

      let finalImages = unsplashImages;

      if (shouldUploadToS3 && unsplashImages.length > 0) {
        console.log('[Image Service] S3 upload enabled, uploading images to S3');
        finalImages = await this.uploadImagesToS3(unsplashImages, project);
      } else if (project?.useS3ForImages && !this.s3Service.isConfigured(project)) {
        console.warn('[Image Service] S3 upload requested but S3 not configured, using Unsplash URLs');
      }

      // Update content with images (either S3 URLs or Unsplash URLs)
      return {
        ...content,
        images: finalImages,
      };
    } catch (error) {
      console.error('[Image Service] Failed to enhance content with images:', error);
      // Return original content if image enhancement fails
      return content;
    }
  }

  /**
   * Upload Unsplash images to S3 and return updated image objects with S3 URLs
   * Falls back to original Unsplash URLs if upload fails
   * @param images Unsplash images to upload
   * @param project Project configuration
   * @returns Images with S3 URLs (or original Unsplash URLs if upload failed)
   */
  private async uploadImagesToS3(images: Image[], project?: ProjectConfig): Promise<Image[]> {
    const uploadedImages: Image[] = [];

    for (const image of images) {
      try {
        console.log(`[Image Service] Uploading image to S3: ${image.url}`);

        // Upload to S3
        const uploadResult = await this.s3Service.uploadImageFromUrl(image.url, project);

        if (uploadResult.success && uploadResult.url) {
          // Use S3 URL
          uploadedImages.push({
            ...image,
            url: uploadResult.url,
          });
          console.log(`[Image Service] Image uploaded successfully: ${uploadResult.url}`);
        } else {
          // Fallback to Unsplash URL
          console.warn(
            `[Image Service] S3 upload failed (${uploadResult.error}), using Unsplash URL`
          );
          uploadedImages.push(image);
        }
      } catch (error) {
        // Fallback to Unsplash URL on error
        console.error('[Image Service] S3 upload error:', error);
        console.warn('[Image Service] Using Unsplash URL as fallback');
        uploadedImages.push(image);
      }
    }

    return uploadedImages;
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
