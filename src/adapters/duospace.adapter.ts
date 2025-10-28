import { BasePublisherAdapter } from "./base.adapter.js";
import {
  Content,
  ProjectConfig,
  PublishResult,
} from "../types/index.js";
import { makeSmartRequest } from "../utils/cloudflare-bypass.js";

interface AuthResponse {
  accessToken: string;
  userId: string;
  email: string;
  role: string;
}

export default class DuospaceAdapter extends BasePublisherAdapter {
  private accessToken?: string;

  constructor(config: ProjectConfig) {
    super(config);
  }

  async authenticate(): Promise<void> {
    try {
      this.log("info", "Authenticating with custom backend");

      // If auth endpoint exists, try to get a new token
      if (this.config.endpoints.auth) {
        const response = await makeSmartRequest(
          this.getEndpointUrl("auth"),
          "POST",
          {
            email: this.config.authConfig.email,
            password: this.config.authConfig.password,
          }
        );

        this.accessToken = (response.data as AuthResponse).accessToken;
        this.log("info", `Authentication used: ${response.tier}`);
      }
      // Set authorization header for future requests
      this.httpClient.defaults.headers.common[
        "Authorization"
      ] = `Bearer ${this.accessToken}`;

      this.authenticated = true;
      this.log("info", "Authentication successful");

      return;
    } catch (error) {
      this.log("error", "Authentication failed", error);
      throw new Error(
        `Authentication failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Publish content to the custom backend
   */
  async publish(
    content: Content,
    _config: ProjectConfig
  ): Promise<PublishResult> {
    try {
      // Validate content
      this.validateContent(content);

      this.log("info", `Publishing: ${content.title}`);

      // Transform platform-agnostic content to custom backend format
      const payload = this.transformContent(content);

      // Make publish request with Cloudflare bypass
      const response = await makeSmartRequest(
        this.getEndpointUrl("publish"),
        "POST",
        payload,
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
          },
        }
      );

      this.log("info", `Published successfully: ${response.data.url}`);
      this.log("info", `Publish used: ${response.tier}`);

      return this.createSuccessResult(
        response.data.url,
        `Post published with ID: ${response.data.id}`
      );
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Transform platform-agnostic content to custom backend format
   */
  private transformContent(content: Content): any {
    return {
      title: content.title,
      slug: this.generateSlug(content.title),
      content: this.formatBody(content, "html"),
      excerpt: this.generateExcerpt(content.body),
      metaDescription: this.generateExcerpt(content.body),
      featuredImage: content.images[0]?.url || null,
      tags: content.metadata.tags,
      published: true,
      authorId: "user-ad057dbc-fa5e-4990-88b1-de9afd25b592",
    };
  }

  /**
   * Generate a URL-safe slug from a title
   */
  private generateSlug(title: string): string {
    return title
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, "") // Remove special characters
      .replace(/\s+/g, "-") // Replace spaces with hyphens
      .replace(/-+/g, "-") // Replace multiple hyphens with single hyphen
      .replace(/^-+|-+$/g, ""); // Remove leading/trailing hyphens
  }

  /**
   * Generate an excerpt from the content body
   */
  private generateExcerpt(body: string, maxLength: number = 160): string {
    // Remove HTML tags
    const text = body.replace(/<[^>]*>/g, "");

    // Truncate to maxLength
    if (text.length <= maxLength) {
      return text;
    }

    // Find last complete word within maxLength
    const truncated = text.substring(0, maxLength);
    const lastSpace = truncated.lastIndexOf(" ");

    return lastSpace > 0
      ? truncated.substring(0, lastSpace) + "..."
      : truncated + "...";
  }
}
