// Image Service - Search and select images using Unsplash or OpenAI DALL-E

import { createApi } from 'unsplash-js';
import { Image, Content, ProjectConfig } from '../types/index.js';
import { S3Service } from './s3.service.js';
import { OpenAIImageService } from './openai-image.service.js';

/**
 * Image service for finding relevant images using Unsplash API or OpenAI DALL-E
 * Optionally uploads images to S3 for self-hosted storage
 * Supports multiple image sources: Unsplash (free), OpenAI (AI-generated), Hybrid (mix), None
 */
export class ImageService {
  private unsplash: ReturnType<typeof createApi>;
  private s3Service: S3Service;
  private openaiImageService?: OpenAIImageService;

  constructor(accessKey: string, s3Service: S3Service, openaiImageService?: OpenAIImageService) {
    if (!accessKey) {
      throw new Error('Unsplash access key is required');
    }

    this.unsplash = createApi({
      accessKey,
    });
    this.s3Service = s3Service;
    this.openaiImageService = openaiImageService;
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
   * Routes to appropriate image source based on project configuration
   * Optionally uploads images to S3 if enabled for the project
   * @param content Content to enhance with images
   * @param imageCount Number of images to add (default: 3)
   * @param project Optional project config for image source and S3 upload
   * @returns Content with images added (with S3 URLs if enabled)
   */
  async enhanceContentWithImages(
    content: Content,
    imageCount: number = 3,
    project?: ProjectConfig
  ): Promise<Content> {
    try {
      // Get image source from project config (default: 'unsplash')
      const imageSource = project?.styleConfig?.imageSource || 'unsplash';

      console.log(`[Image Service] Image source: ${imageSource}`);

      let finalImages: Image[] = [];

      // Route based on image source
      switch (imageSource) {
        case 'openai':
          // Use OpenAI DALL-E only
          finalImages = await this.getOpenAIImages(content, imageCount, project);
          break;

        case 'hybrid':
          // Mix: 1 DALL-E header + (imageCount - 1) Unsplash illustrations
          const headerImage = await this.getOpenAIImages(content, 1, project);
          const unsplashCount = Math.max(0, imageCount - 1);

          if (unsplashCount > 0) {
            const unsplashImages = await this.getUnsplashImages(content, unsplashCount, project);
            finalImages = [...headerImage, ...unsplashImages];
          } else {
            finalImages = headerImage;
          }
          break;

        case 'none':
          // No images
          console.log('[Image Service] Image source set to "none", skipping images');
          finalImages = [];
          break;

        case 'unsplash':
        default:
          // Use Unsplash (current behavior)
          finalImages = await this.getUnsplashImages(content, imageCount, project);
          break;
      }

      // Update content with images
      return {
        ...content,
        images: finalImages,
      };
    } catch (error) {
      console.error('[Image Service] Failed to enhance content with images:', error);

      // Fallback to Unsplash if OpenAI fails (unless explicitly disabled)
      const imageSource = project?.styleConfig?.imageSource;
      if (imageSource === 'openai' || imageSource === 'hybrid') {
        console.warn('[Image Service] OpenAI image generation failed, falling back to Unsplash');
        try {
          const fallbackImages = await this.getUnsplashImages(content, imageCount, project);
          return { ...content, images: fallbackImages };
        } catch (fallbackError) {
          console.error('[Image Service] Unsplash fallback also failed');
        }
      }

      // Return original content if all image enhancement attempts fail
      return content;
    }
  }

  /**
   * Get images from OpenAI DALL-E
   * @param content Content to generate images for
   * @param count Number of images to generate
   * @param project Project config
   * @returns Array of AI-generated images with S3 URLs
   */
  private async getOpenAIImages(
    content: Content,
    count: number,
    project?: ProjectConfig
  ): Promise<Image[]> {
    if (!this.openaiImageService) {
      throw new Error(
        'OpenAI image service not initialized. Cannot use "openai" or "hybrid" image source.'
      );
    }

    console.log(`[Image Service] Generating ${count} DALL-E images`);

    const openaiConfig = project?.styleConfig?.openaiImageConfig;
    return await this.openaiImageService.generateImagesForContent(
      content,
      count,
      openaiConfig,
      project
    );
  }

  /**
   * Get images from Unsplash
   * @param content Content to search images for
   * @param count Number of images to find
   * @param project Project config for S3 upload
   * @returns Array of Unsplash images (with S3 URLs if enabled)
   */
  private async getUnsplashImages(
    content: Content,
    count: number,
    project?: ProjectConfig
  ): Promise<Image[]> {
    // Search for images from Unsplash
    const unsplashImages = await this.searchImages(
      content.title,
      content.metadata.customFields?.fieldNiche,
      content.metadata.tags,
      count
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

    return finalImages;
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
