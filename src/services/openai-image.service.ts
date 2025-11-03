// OpenAI Image Generation Service - DALL-E powered image creation

import OpenAI from 'openai';
import { Content, Image, OpenAIImageConfig, ProjectConfig } from '../types/index.js';
import { S3Service } from './s3.service.js';
import { DatabaseService } from './database.service.js';

/**
 * OpenAI Image Generation Service using DALL-E
 * Handles AI-powered image generation with automatic S3 upload
 */
export class OpenAIImageService {
  private client: OpenAI;
  private s3Service: S3Service;
  private databaseService: DatabaseService;
  private promptModel: string; // Model for prompt enhancement (gpt-4o-mini)

  constructor(
    apiKey: string,
    s3Service: S3Service,
    databaseService: DatabaseService,
    promptModel: string = 'gpt-4o-mini'
  ) {
    if (!apiKey) {
      throw new Error('OpenAI API key is required for image generation');
    }

    this.client = new OpenAI({ apiKey });
    this.s3Service = s3Service;
    this.databaseService = databaseService;
    this.promptModel = promptModel;
  }

  /**
   * Get default OpenAI image configuration
   */
  private getDefaultConfig(): OpenAIImageConfig {
    return {
      model: (process.env.OPENAI_IMAGE_MODEL as 'dall-e-2' | 'dall-e-3') || 'dall-e-3',
      size: (process.env.OPENAI_IMAGE_SIZE as '1024x1024' | '1792x1024' | '1024x1792') || '1024x1024',
      quality: (process.env.OPENAI_IMAGE_QUALITY as 'standard' | 'hd') || 'standard',
      style: (process.env.OPENAI_IMAGE_STYLE as 'vivid' | 'natural') || 'vivid',
      promptEnhancement: true,
    };
  }

  /**
   * Validate S3 configuration (mandatory for OpenAI images since URLs expire in 1 hour)
   * @throws Error if S3 is not configured
   */
  private validateS3Configuration(project?: ProjectConfig): void {
    if (!this.s3Service.isConfigured(project)) {
      throw new Error(
        'S3 configuration required for OpenAI image generation (DALL-E URLs expire in 1 hour). ' +
        'Please configure S3 in project settings or environment variables.'
      );
    }
  }

  /**
   * Generate a single image with DALL-E
   * @param prompt Text description for image generation
   * @param config DALL-E configuration (model, size, quality, style)
   * @param project Optional project config for S3 upload
   * @returns Image object with permanent S3 URL
   */
  async generateImage(
    prompt: string,
    config?: Partial<OpenAIImageConfig>,
    project?: ProjectConfig
  ): Promise<Image> {
    try {
      // Validate S3 is configured
      this.validateS3Configuration(project);

      // Merge with defaults
      const fullConfig = { ...this.getDefaultConfig(), ...config };

      await this.databaseService.logInfo(
        `Generating DALL-E image: ${prompt.slice(0, 100)}...`,
        undefined,
        project?.id
      );

      // Generate image with DALL-E
      const response = await this.client.images.generate({
        model: fullConfig.model,
        prompt,
        size: fullConfig.size,
        quality: fullConfig.quality,
        style: fullConfig.style,
        n: 1, // DALL-E 3 only supports n=1
        response_format: 'url', // Use URL format (simpler than b64_json)
      });

      if (!response.data || response.data.length === 0) {
        throw new Error('DALL-E did not return any image data');
      }

      const dalleUrl = response.data[0]?.url;
      if (!dalleUrl) {
        throw new Error('DALL-E did not return an image URL');
      }

      // Log the revised prompt (DALL-E 3 enhances prompts automatically)
      const revisedPrompt = response.data[0]?.revised_prompt;
      if (revisedPrompt) {
        await this.databaseService.logInfo(
          `DALL-E revised prompt: ${revisedPrompt}`,
          undefined,
          project?.id
        );
      }

      // Download and upload to S3 (DALL-E URLs expire in 1 hour)
      const s3Url = await this.downloadAndStoreImage(dalleUrl, project);

      // Calculate cost for logging
      const cost = this.calculateImageCost(fullConfig);
      await this.databaseService.logInfo(
        `DALL-E image generated and uploaded to S3 (cost: $${cost.toFixed(4)})`,
        undefined,
        project?.id
      );

      return {
        url: s3Url,
        alt: this.generateAltText(prompt),
        caption: revisedPrompt?.slice(0, 200), // Use DALL-E's enhanced prompt as caption
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await this.databaseService.logError(
        `DALL-E image generation failed: ${errorMessage}`,
        undefined,
        project?.id
      );
      throw error;
    }
  }

  /**
   * Generate multiple images for blog post content
   * @param content Blog post content with title and metadata
   * @param count Number of images to generate (default: 3)
   * @param config DALL-E configuration
   * @param project Optional project config
   * @returns Array of Image objects with S3 URLs
   */
  async generateImagesForContent(
    content: Content,
    count: number = 3,
    config?: Partial<OpenAIImageConfig>,
    project?: ProjectConfig
  ): Promise<Image[]> {
    try {
      const fullConfig = { ...this.getDefaultConfig(), ...config };
      const images: Image[] = [];

      await this.databaseService.logInfo(
        `Generating ${count} DALL-E images for: "${content.title}"`,
        undefined,
        project?.id
      );

      // Generate images sequentially (DALL-E 3 doesn't support batch generation)
      for (let i = 0; i < count; i++) {
        const imageType: 'header' | 'illustration' = i === 0 ? 'header' : 'illustration';

        // Build prompt (use AI if enhancement enabled, otherwise simple template)
        const prompt = fullConfig.promptEnhancement
          ? await this.buildImagePrompt(content, imageType, content.metadata.customFields?.fieldNiche)
          : this.buildSimplePrompt(content, imageType);

        // Generate image
        const image = await this.generateImage(prompt, fullConfig, project);
        images.push(image);

        // Small delay to avoid rate limits (if generating multiple images)
        if (i < count - 1) {
          await this.delay(1000); // 1 second delay between images
        }
      }

      return images;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await this.databaseService.logError(
        `Failed to generate images for content: ${errorMessage}`,
        undefined,
        project?.id
      );
      throw error;
    }
  }

  /**
   * Build DALL-E prompt from content metadata using GPT-4o-mini
   * Uses AI to craft effective image generation prompts
   * @param content Blog post content
   * @param imageType Header image or mid-article illustration
   * @param fieldNiche Topic/niche for context
   * @returns Optimized DALL-E prompt
   */
  private async buildImagePrompt(
    content: Content,
    imageType: 'header' | 'illustration',
    fieldNiche?: string
  ): Promise<string> {
    const systemPrompt = `You are an expert at crafting DALL-E image generation prompts for blog posts.
Generate a detailed, descriptive prompt (100-200 words) that will create a ${imageType} image.

Requirements:
- Specify artistic style (e.g., "modern flat design", "photorealistic", "minimalist illustration", "3D render")
- Include composition details (e.g., "centered composition", "3/4 view", "aerial perspective", "close-up")
- Mention colors and mood (e.g., "vibrant colors", "muted tones", "warm lighting", "cool blue palette")
- Avoid requesting text in images (DALL-E handles text poorly)
- Focus on visual metaphors for abstract concepts
- Be specific about subjects, objects, and their relationships
- For technical/business content, use professional, clean aesthetics
- For creative content, use artistic, expressive styles

Output ONLY the prompt text, no explanations or preamble.`;

    const contentPreview = content.body.slice(0, 500).replace(/[#*`]/g, ''); // Remove markdown
    const userPrompt = `Create a ${imageType} image prompt for a blog post:

Title: ${content.title}
Field/Niche: ${fieldNiche || 'General'}
Keywords: ${content.metadata.tags?.join(', ') || 'none'}
Content Preview: ${contentPreview}...

Generate the DALL-E prompt:`;

    try {
      const response = await this.client.chat.completions.create({
        model: this.promptModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 300,
        temperature: 0.8, // Higher creativity for image prompts
      });

      const prompt = response.choices[0]?.message?.content?.trim() || '';

      if (!prompt) {
        throw new Error('GPT did not return a prompt');
      }

      return prompt;
    } catch (error) {
      // Fallback to simple prompt if AI enhancement fails
      console.warn('Prompt enhancement failed, using simple template:', error);
      return this.buildSimplePrompt(content, imageType);
    }
  }

  /**
   * Build simple DALL-E prompt without AI enhancement (fallback)
   */
  private buildSimplePrompt(content: Content, imageType: 'header' | 'illustration'): string {
    const keywords = content.metadata.tags?.join(', ') || '';
    const style = imageType === 'header'
      ? 'professional, modern illustration with vibrant colors'
      : 'clean, minimalist design';

    return `A ${style} depicting ${content.title}. Related to: ${keywords}. High quality, detailed, photorealistic.`;
  }

  /**
   * Download image from DALL-E URL and upload to S3
   * DALL-E URLs expire after 1 hour, so we must download and rehost immediately
   * @param dalleUrl Temporary DALL-E image URL
   * @param project Optional project config for S3 credentials
   * @returns Permanent S3 URL
   */
  private async downloadAndStoreImage(dalleUrl: string, project?: ProjectConfig): Promise<string> {
    try {
      // Fetch image from DALL-E URL
      const response = await fetch(dalleUrl);
      if (!response.ok) {
        throw new Error(`Failed to download image: ${response.statusText}`);
      }

      // Get image buffer
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Determine content type (DALL-E returns PNG)
      const contentType = response.headers.get('content-type') || 'image/png';

      // Generate filename with timestamp
      const timestamp = Date.now();
      const filename = `dalle-${timestamp}.png`;

      // Upload to S3
      const uploadResult = await this.s3Service.uploadImage(buffer, filename, contentType, project);

      if (!uploadResult.success || !uploadResult.url) {
        throw new Error(uploadResult.error || 'S3 upload failed');
      }

      return uploadResult.url;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to download and store DALL-E image: ${errorMessage}`);
    }
  }

  /**
   * Generate alt text from DALL-E prompt
   */
  private generateAltText(prompt: string): string {
    // Use first 100 characters of prompt as alt text
    return prompt.slice(0, 100).trim();
  }

  /**
   * Calculate cost of a DALL-E image based on configuration
   */
  private calculateImageCost(config: OpenAIImageConfig): number {
    if (config.model === 'dall-e-2') {
      return 0.02; // $0.02 for DALL-E 2 (any size)
    }

    // DALL-E 3 pricing
    if (config.quality === 'hd') {
      return 0.08; // $0.08 for HD quality
    }

    return 0.04; // $0.04 for standard quality
  }

  /**
   * Utility: Delay for rate limiting
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
