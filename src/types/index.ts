// Core type definitions for the content creator system

/**
 * Platform-agnostic content format
 * This structure is used by all adapters and transformed to platform-specific formats
 */
export interface Content {
  title: string;
  body: string; // markdown or HTML
  images: Image[];
  metadata: ContentMetadata;
}

/**
 * Image information for content
 */
export interface Image {
  url: string;
  alt: string;
  caption?: string;
}

/**
 * Metadata attached to content
 */
export interface ContentMetadata {
  tags: string[];
  categories?: string[];
  publishDate: Date;
  customFields?: Record<string, any>;
  language?: string; // ISO 639-1 code (en, es, ja, etc.)
  seoMetadata?: SEOMetadata;
}

/**
 * SEO metadata for multilingual content
 */
export interface SEOMetadata {
  localizedKeywords: string[]; // Keywords in target language
  metaDescription: string; // 150-160 chars in target language
  ogLocale: string; // e.g., "es_ES", "ja_JP", "en_US"
  hrefLangAlternates?: HrefLangAlternate[];
}

/**
 * Alternate language versions for hreflang tags
 */
export interface HrefLangAlternate {
  language: string; // ISO 639-1 code
  url: string; // URL of the alternate version
}

/**
 * S3 configuration for image storage
 */
export interface S3Config {
  endpoint: string; // S3 endpoint URL (e.g., https://s3.ir-thr-at1.arvanstorage.ir)
  accessKeyId: string; // S3 access key
  secretAccessKey: string; // S3 secret key
  bucket: string; // S3 bucket name
  region: string; // S3 region (e.g., ir-thr-at1)
  publicUrl?: string; // Optional public URL for accessing images
}

/**
 * Result of an S3 upload operation
 */
export interface S3UploadResult {
  success: boolean;
  url?: string; // S3 URL of uploaded image
  key?: string; // S3 object key
  error?: string;
}

/**
 * Project configuration stored in database
 */
export interface ProjectConfig {
  id: string;
  name: string;
  platformType: string; // Identifier for which adapter to use
  endpoints: Record<string, string>; // API endpoint URLs
  authConfig: Record<string, any>; // Authentication details
  parameters: Record<string, any>; // Platform-specific parameters
  styleConfig: StyleConfig;
  isActive: boolean;
  language?: string; // ISO 639-1 code (en, es, fr, ja, ar, etc.)
  languageConfig?: LanguageConfig;
  useS3ForImages?: boolean; // Enable S3 upload for images (default: false)
  s3Config?: S3Config; // Per-project S3 credentials (overrides global env vars)
}

/**
 * Language-specific configuration for content generation
 */
export interface LanguageConfig {
  regionalVariant?: string; // e.g., "es-MX" (Mexican Spanish), "zh-CN" (Simplified Chinese)
  scriptDirection?: 'ltr' | 'rtl'; // Left-to-right or right-to-left (for Arabic, Hebrew)
  culturalContext?: string; // e.g., "Latin American", "Middle Eastern", "East Asian"
  seoStrategy?: {
    localizedKeywords: boolean; // Generate keywords in target language
    hrefLangTags: boolean; // Generate hreflang alternate tags
    metaDescriptionLanguage: string; // Language for meta description
  };
}

/**
 * Content style configuration
 */
export interface StyleConfig {
  tone?: 'professional' | 'casual' | 'technical' | 'friendly';
  length?: 'short' | 'medium' | 'long';
  includeImages?: boolean;
  customInstructions?: string;
  languageInstructions?: string; // e.g., "Use formal Spanish", "Include honorifics for Japanese"
  culturalConsiderations?: string; // e.g., "Avoid idioms", "Use metric system", "Reference local examples"
}

/**
 * Post record from database
 */
export interface Post {
  id: string;
  projectId: string;
  title: string;
  fieldNiche?: string;
  keywords?: string[];
  contentJson?: Content;
  status: PostStatus;
  publishDate: Date;
  retryCount: number;
  maxRetries: number;
  publishedUrl?: string;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
  publishedAt?: Date;
}

/**
 * Post status enum
 */
export type PostStatus = 'pending' | 'processing' | 'published' | 'failed';

/**
 * Result of a publishing operation
 */
export interface PublishResult {
  success: boolean;
  url?: string; // Published post URL
  message?: string;
  error?: string;
}

/**
 * Media file for upload
 */
export interface MediaFile {
  buffer: Buffer;
  filename: string;
  mimetype: string;
}

/**
 * Log entry
 */
export interface Log {
  id: string;
  postId?: string;
  projectId?: string;
  level: LogLevel;
  message: string;
  metadata?: Record<string, any>;
  createdAt: Date;
}

/**
 * Log level enum
 */
export type LogLevel = 'info' | 'warning' | 'error' | 'debug';

/**
 * Publisher interface that all adapters must implement
 */
export interface IPublisher {
  /**
   * Authenticate with the platform using credentials from config
   */
  authenticate(): Promise<void>;

  /**
   * Publish content to the platform
   * @param content Platform-agnostic content
   * @param config Project configuration
   * @returns Result with success status and published URL
   */
  publish(content: Content, config: ProjectConfig): Promise<PublishResult>;

  /**
   * Upload media to the platform (optional)
   * @param media Media file to upload
   * @returns URL of the uploaded media
   */
  uploadMedia?(media: MediaFile): Promise<string>;
}

/**
 * Research result from SerpAPI
 */
export interface ResearchResult {
  query: string;
  results: SearchResult[];
  timestamp: Date;
}

/**
 * Individual search result
 */
export interface SearchResult {
  title: string;
  snippet: string;
  url: string;
  source?: string;
}

/**
 * Configuration for CLI commands
 */
export interface CliOptions {
  project?: string; // Filter by project name or 'all'
  mode?: 'publish' | 'dry-run'; // Actual publish or simulation
  dryRun?: boolean; // Alternative flag for dry-run mode
  date?: string; // Process posts for specific date
}

/**
 * Retry configuration
 */
export interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

/**
 * Content generation request
 */
export interface ContentGenerationRequest {
  title: string;
  fieldNiche?: string;
  keywords?: string[];
  research?: ResearchResult;
  styleConfig: StyleConfig;
  contentAngle?: {
    angle: string;
    reasoning: string;
    focusAreas: string[];
  };
}

/**
 * Actionable improvement instruction (Self-Refine methodology)
 * Provides specific, localized feedback with concrete actions
 */
export interface ActionableImprovement {
  location: string; // e.g., "Paragraph 2", "Introduction", "Section: Quality Metrics"
  issue: string; // What's wrong (localization)
  action: string; // Specific instruction to fix it (actionable)
  source_reference?: string; // Which research source to use (e.g., "Source #3")
}

/**
 * Quality rating for content assessment
 */
export interface QualityRating {
  score: number; // Overall quality score from 1-10
  feedback: string; // Detailed explanation of the rating
  areas_to_improve: string[]; // General aspects that need improvement (kept for backward compat)
  actionable_improvements: ActionableImprovement[]; // Specific paragraph-level instructions (Self-Refine)
  word_count: number; // Actual word count in the content
  structure_score: number; // Score for content structure (1-10)
  depth_score: number; // Score for content depth and research quality (1-10)
  engagement_score: number; // Score for reader engagement (1-10)
}

/**
 * Iteration history entry tracking content improvements
 */
export interface IterationHistory {
  iteration_number: number;
  content: Content;
  rating: QualityRating;
}
