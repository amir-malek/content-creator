// Research Service - Web search using SerpAPI

import { getJson } from 'serpapi';
import axios from 'axios';
import { ResearchResult, SearchResult } from '../types/index.js';
import type { ContentGenerationService } from './content-generation.service.js';

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
   * @param title Post title (or raw query if fieldNiche and keywords are undefined)
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
      // If fieldNiche and keywords are undefined, treat title as a raw query (AI-planned)
      const query =
        fieldNiche === undefined && keywords === undefined
          ? title
          : this.buildSearchQuery(title, fieldNiche, keywords);

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

  /**
   * Scrape and enrich research results with full content summaries
   * Used when initial research quality is poor and deeper research is needed
   * @param researchResult Initial research result with snippets
   * @param contentGenService Content generation service for summarization
   * @param numUrls Number of top URLs to scrape (default: 3)
   * @param targetTokens Target tokens per summary (default: 500)
   * @returns Enriched research result with detailed summaries
   */
  async scrapeAndEnrichResults(
    researchResult: ResearchResult,
    contentGenService: ContentGenerationService,
    numUrls: number = 3,
    targetTokens: number = 500
  ): Promise<ResearchResult> {
    try {
      console.log(`[Research] Enriching research with ${numUrls} scraped URLs`);

      // Take top N URLs
      const urlsToScrape = researchResult.results.slice(0, numUrls);

      if (urlsToScrape.length === 0) {
        console.log('[Research] No URLs to scrape, returning original research');
        return researchResult;
      }

      // Scrape and summarize each URL
      const enrichedResults: SearchResult[] = [];

      for (const result of urlsToScrape) {
        try {
          console.log(`[Research] Scraping ${result.url}`);

          // Fetch full page content
          const response = await axios.get(result.url, {
            timeout: 10000, // 10 second timeout
            headers: {
              'User-Agent':
                'Mozilla/5.0 (compatible; ContentCreatorBot/1.0; +https://example.com/bot)',
            },
            maxRedirects: 3,
          });

          // Extract text content (basic HTML stripping)
          const htmlContent = response.data;
          const textContent = this.extractTextFromHtml(htmlContent);

          // Summarize using AI with blog topic context for focused extraction
          const summary = await contentGenService.summarizeWebContent(
            textContent,
            result.url,
            targetTokens,
            researchResult.query // Pass the search query as blog topic context
          );

          // Create enriched result
          enrichedResults.push({
            title: result.title,
            snippet: summary, // Replace snippet with AI summary
            url: result.url,
            source: result.source,
          });

          console.log(`[Research] Successfully enriched ${result.url}`);
        } catch (error) {
          console.error(`[Research] Failed to scrape ${result.url}:`, error);
          // Keep original result if scraping fails
          enrichedResults.push(result);
        }
      }

      // Add remaining results (not scraped) as-is
      const remainingResults = researchResult.results.slice(numUrls);
      const finalResults = [...enrichedResults, ...remainingResults];

      console.log(
        `[Research] Enrichment complete: ${enrichedResults.length} URLs enriched, ${remainingResults.length} kept original`
      );

      return {
        query: researchResult.query,
        results: finalResults,
        timestamp: new Date(),
      };
    } catch (error) {
      console.error('[Research] Enrichment failed:', error);
      // Return original research if enrichment completely fails
      return researchResult;
    }
  }

  /**
   * Extract plain text from HTML content
   * Basic implementation - removes HTML tags and scripts
   */
  private extractTextFromHtml(html: string): string {
    // Remove script and style tags with their content
    let text = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

    // Remove HTML tags
    text = text.replace(/<[^>]+>/g, ' ');

    // Decode common HTML entities
    text = text
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");

    // Normalize whitespace
    text = text.replace(/\s+/g, ' ').trim();

    return text;
  }
}
