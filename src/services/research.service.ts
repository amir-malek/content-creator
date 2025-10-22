// Research Service - Web search using SerpAPI

import { getJson } from 'serpapi';
import { ResearchResult, SearchResult } from '../types/index.js';

/**
 * Research service for gathering up-to-date information from the web
 * Uses SerpAPI (free tier available) for real-time search results
 */
export class ResearchService {
  private apiKey: string;

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('SerpAPI key is required');
    }
    this.apiKey = apiKey;
  }

  /**
   * Search for information related to the post title and keywords
   * @param title Post title
   * @param fieldNiche Topic area or niche
   * @param keywords Additional keywords for search
   * @param numResults Number of results to return (default: 10)
   * @returns Research results with snippets and sources
   */
  async search(
    title: string,
    fieldNiche?: string,
    keywords?: string[],
    numResults: number = 10
  ): Promise<ResearchResult> {
    try {
      // Build search query
      const query = this.buildSearchQuery(title, fieldNiche, keywords);

      console.log(`[Research] Searching for: ${query}`);

      // Execute search via SerpAPI
      const response = await getJson({
        engine: 'google',
        q: query,
        api_key: this.apiKey,
        num: numResults,
      });

      // Extract and format results
      const results = this.parseResults(response);

      console.log(`[Research] Found ${results.length} results`);

      return {
        query,
        results,
        timestamp: new Date(),
      };
    } catch (error) {
      console.error('[Research] Search failed:', error);
      throw new Error(
        `Research search failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Build an optimized search query from title and keywords
   */
  private buildSearchQuery(title: string, fieldNiche?: string, keywords?: string[]): string {
    const currentYear = new Date().getFullYear();
    const parts: string[] = [];

    // Add title (primary search term)
    parts.push(title);

    // Add field/niche if provided
    if (fieldNiche) {
      parts.push(fieldNiche);
    }

    // Add keywords (up to 2 most relevant)
    if (keywords && keywords.length > 0) {
      parts.push(...keywords.slice(0, 2));
    }

    // Add current year for recency
    parts.push(currentYear.toString());

    return parts.join(' ');
  }

  /**
   * Parse SerpAPI response and extract relevant search results
   */
  private parseResults(response: any): SearchResult[] {
    const results: SearchResult[] = [];

    // Extract organic results
    if (response.organic_results && Array.isArray(response.organic_results)) {
      for (const result of response.organic_results) {
        if (result.title && result.snippet && result.link) {
          results.push({
            title: result.title,
            snippet: result.snippet,
            url: result.link,
            source: this.extractDomain(result.link),
          });
        }
      }
    }

    // Also check for featured snippet (high-quality source)
    if (response.answer_box) {
      const answerBox = response.answer_box;
      if (answerBox.snippet || answerBox.answer) {
        results.unshift({
          title: answerBox.title || 'Featured Snippet',
          snippet: answerBox.snippet || answerBox.answer,
          url: answerBox.link || '',
          source: answerBox.displayed_link || this.extractDomain(answerBox.link),
        });
      }
    }

    return results;
  }

  /**
   * Extract domain name from URL
   */
  private extractDomain(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace('www.', '');
    } catch {
      return 'Unknown';
    }
  }

  /**
   * Search for specific facts or statistics
   * Useful for agentic workflows when more depth is needed
   */
  async searchForFacts(topic: string, numResults: number = 5): Promise<ResearchResult> {
    const query = `${topic} facts statistics latest ${new Date().getFullYear()}`;

    try {
      const response = await getJson({
        engine: 'google',
        q: query,
        api_key: this.apiKey,
        num: numResults,
      });

      const results = this.parseResults(response);

      return {
        query,
        results,
        timestamp: new Date(),
      };
    } catch (error) {
      console.error('[Research] Fact search failed:', error);
      throw new Error(
        `Fact search failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Search for recent news/articles on a topic
   */
  async searchNews(topic: string, numResults: number = 5): Promise<ResearchResult> {
    try {
      const response = await getJson({
        engine: 'google_news',
        q: topic,
        api_key: this.apiKey,
        num: numResults,
      });

      const results: SearchResult[] = [];

      if (response.news_results && Array.isArray(response.news_results)) {
        for (const result of response.news_results) {
          if (result.title && result.snippet && result.link) {
            results.push({
              title: result.title,
              snippet: result.snippet,
              url: result.link,
              source: result.source?.name || this.extractDomain(result.link),
            });
          }
        }
      }

      return {
        query: topic,
        results,
        timestamp: new Date(),
      };
    } catch (error) {
      console.error('[Research] News search failed:', error);
      throw new Error(
        `News search failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
