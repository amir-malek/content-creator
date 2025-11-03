import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { S3Config, S3UploadResult, ProjectConfig } from '../types';
import { DatabaseService } from './database.service';
import crypto from 'crypto';

/**
 * S3Service handles image uploads to S3-compatible storage (Arvan S3)
 * Supports both global configuration (env vars) and per-project configuration
 */
export class S3Service {
  private client: S3Client | null = null;
  private databaseService: DatabaseService;

  constructor(databaseService: DatabaseService) {
    this.databaseService = databaseService;
  }

  /**
   * Get S3 configuration, merging global env vars with project-specific config
   * Project config takes precedence over global config
   */
  getS3Config(project?: ProjectConfig): S3Config | null {
    // Use project-specific config if available
    if (project?.s3Config) {
      return project.s3Config;
    }

    // Fall back to global env vars
    const endpoint = process.env.S3_ENDPOINT;
    const accessKeyId = process.env.S3_ACCESS_KEY_ID;
    const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
    const bucket = process.env.S3_BUCKET_NAME;
    const region = process.env.S3_REGION || 'us-east-1';

    if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
      return null;
    }

    return {
      endpoint,
      accessKeyId,
      secretAccessKey,
      bucket,
      region,
      publicUrl: process.env.S3_PUBLIC_URL,
    };
  }

  /**
   * Check if S3 is configured (either globally or for specific project)
   */
  isConfigured(project?: ProjectConfig): boolean {
    return this.getS3Config(project) !== null;
  }

  /**
   * Initialize S3 client with configuration
   */
  private initializeClient(config: S3Config): void {
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: true, // Required for Arvan S3 and some S3-compatible services
    });
  }

  /**
   * Upload an image buffer to S3
   * @param buffer Image data as buffer
   * @param originalFilename Original filename (for extension detection)
   * @param contentType MIME type (e.g., 'image/jpeg', 'image/png')
   * @param project Optional project config for per-project S3 credentials
   * @returns Upload result with S3 URL
   */
  async uploadImage(
    buffer: Buffer,
    originalFilename: string,
    contentType: string,
    project?: ProjectConfig
  ): Promise<S3UploadResult> {
    try {
      // Get configuration
      const config = this.getS3Config(project);
      if (!config) {
        await this.databaseService.logError(
          'S3 upload failed: S3 not configured',
          undefined,
          project?.id
        );
        return {
          success: false,
          error: 'S3 not configured',
        };
      }

      // Initialize client with current config
      this.initializeClient(config);

      if (!this.client) {
        return {
          success: false,
          error: 'Failed to initialize S3 client',
        };
      }

      // Generate unique filename with timestamp and random hash
      const timestamp = Date.now();
      const randomHash = crypto.randomBytes(8).toString('hex');
      const extension = originalFilename.split('.').pop() || 'jpg';
      const key = `images/${timestamp}-${randomHash}.${extension}`;

      // Upload to S3
      const command = new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        ACL: 'public-read', // Make images publicly accessible
      });

      await this.client.send(command);

      // Generate public URL
      const url = config.publicUrl
        ? `${config.publicUrl}/${key}`
        : `${config.endpoint}/${config.bucket}/${key}`;

      await this.databaseService.logInfo(
        `Image uploaded to S3: ${key}`,
        undefined,
        project?.id
      );

      return {
        success: true,
        url,
        key,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      await this.databaseService.logError(
        `S3 upload failed: ${errorMessage}`,
        undefined,
        project?.id
      );

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Download an image from a URL and return as buffer
   * @param url Image URL to download
   * @returns Buffer containing image data
   */
  async downloadImage(url: string): Promise<Buffer> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `Failed to download image: ${response.status} ${response.statusText}`
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * Get content type from URL or filename
   * @param urlOrFilename URL or filename
   * @returns MIME type
   */
  getContentType(urlOrFilename: string): string {
    const extension = urlOrFilename.split('.').pop()?.toLowerCase();

    const mimeTypes: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
      svg: 'image/svg+xml',
    };

    return mimeTypes[extension || ''] || 'image/jpeg';
  }

  /**
   * Upload an image from a URL to S3
   * Downloads the image first, then uploads to S3
   * @param imageUrl URL of the image to upload
   * @param project Optional project config
   * @returns Upload result with S3 URL
   */
  async uploadImageFromUrl(
    imageUrl: string,
    project?: ProjectConfig
  ): Promise<S3UploadResult> {
    try {
      // Download image
      const buffer = await this.downloadImage(imageUrl);

      // Extract filename from URL
      const urlParts = imageUrl.split('/');
      const filename = urlParts[urlParts.length - 1] || 'image.jpg';

      // Get content type
      const contentType = this.getContentType(imageUrl);

      // Upload to S3
      return await this.uploadImage(buffer, filename, contentType, project);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      await this.databaseService.logError(
        `Failed to upload image from URL ${imageUrl}: ${errorMessage}`,
        undefined,
        project?.id
      );

      return {
        success: false,
        error: errorMessage,
      };
    }
  }
}
