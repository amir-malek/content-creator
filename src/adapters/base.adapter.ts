// Base Publisher Adapter - Abstract class with common functionality

import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { IPublisher, Content, ProjectConfig, PublishResult, MediaFile } from '../types/index.js';

/**
 * Abstract base class for publisher adapters
 * Provides common functionality like HTTP client, error handling, and utilities
 */
export abstract class BasePublisherAdapter implements IPublisher {
  protected config: ProjectConfig;
  protected httpClient: AxiosInstance;
  protected authenticated: boolean = false;

  constructor(config: ProjectConfig) {
    this.config = config;

    // Initialize HTTP client with base configuration
    this.httpClient = axios.create({
      timeout: 30000, // 30 second timeout
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'ContentCreator/1.0',
        ...this.config.parameters?.headers,
      },
    });

    // Add request interceptor for logging
    this.httpClient.interceptors.request.use(
      (config) => {
        this.log('debug', `API Request: ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Add response interceptor for error handling
    this.httpClient.interceptors.response.use(
      (response) => response,
      (error) => {
        this.log('error', `API Error: ${error.message}`, {
          url: error.config?.url,
          status: error.response?.status,
          data: error.response?.data,
        });
        return Promise.reject(error);
      }
    );
  }

  /**
   * Authenticate with the platform - must be implemented by each adapter
   */
  abstract authenticate(): Promise<void>;

  /**
   * Publish content to the platform - must be implemented by each adapter
   */
  abstract publish(content: Content, config: ProjectConfig): Promise<PublishResult>;

  /**
   * Upload media to the platform (optional, can be overridden)
   */
  async uploadMedia?(_media: MediaFile): Promise<string> {
    throw new Error('Media upload not implemented for this adapter');
  }

  /**
   * Helper: Make authenticated API request
   */
  protected async makeRequest<T>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    endpoint: string,
    data?: any,
    additionalConfig?: AxiosRequestConfig
  ): Promise<T> {
    if (!this.authenticated) {
      await this.authenticate();
    }

    const url = this.getEndpointUrl(endpoint);
    const response = await this.httpClient.request<T>({
      method,
      url,
      data,
      ...additionalConfig,
    });

    return response.data;
  }

  /**
   * Helper: Get full URL for an endpoint
   */
  protected getEndpointUrl(endpointKey: string): string {
    const url = this.config.endpoints[endpointKey];
    if (!url) {
      throw new Error(`Endpoint "${endpointKey}" not found in project configuration`);
    }
    return url;
  }

  /**
   * Helper: Format content body (convert markdown to HTML if needed)
   */
  protected formatBody(content: Content, _format: 'markdown' | 'html' = 'html'): string {
    // For MVP, we'll assume body is already in the correct format
    // In production, you might want to add markdown-to-html conversion here
    return content.body;
  }

  /**
   * Helper: Extract image URLs from content
   */
  protected getImageUrls(content: Content): string[] {
    return content.images.map((img) => img.url);
  }

  /**
   * Helper: Log messages (can be overridden for custom logging)
   */
  protected log(level: 'info' | 'error' | 'debug', message: string, metadata?: any): void {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      adapter: this.config.platformType,
      project: this.config.name,
      message,
      ...(metadata && { metadata }),
    };

    // In production, this should write to the logs table
    console.log(JSON.stringify(logEntry));
  }

  /**
   * Helper: Handle errors and create PublishResult
   */
  protected handleError(error: unknown): PublishResult {
    const message = error instanceof Error ? error.message : String(error);
    this.log('error', `Publishing failed: ${message}`, { error });

    return {
      success: false,
      error: message,
      message: 'Failed to publish content',
    };
  }

  /**
   * Helper: Create success result
   */
  protected createSuccessResult(url: string, message?: string): PublishResult {
    return {
      success: true,
      url,
      message: message || 'Content published successfully',
    };
  }

  /**
   * Helper: Validate content before publishing
   */
  protected validateContent(content: Content): void {
    if (!content.title || content.title.trim() === '') {
      throw new Error('Content title is required');
    }

    if (!content.body || content.body.trim() === '') {
      throw new Error('Content body is required');
    }
  }

  /**
   * Helper: Sleep utility for rate limiting
   */
  protected async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
