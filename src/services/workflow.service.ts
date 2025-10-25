// Workflow Service - Orchestrates research and content generation

import { ResearchService } from './research.service.js';
import { ContentGenerationService } from './content-generation.service.js';
import {
  Content,
  Post,
  StyleConfig,
  ResearchResult,
  IterationHistory,
} from '../types/index.js';

/**
 * Workflow service that orchestrates the research → synthesis → generation pipeline
 * Implements agentic behavior to decide when more research is needed
 */
export class WorkflowService {
  private researchService: ResearchService;
  private contentService: ContentGenerationService;
  private maxResearchIterations: number = 2;

  constructor(researchService: ResearchService, contentService: ContentGenerationService) {
    this.researchService = researchService;
    this.contentService = contentService;
  }

  /**
   * Generate complete content for a post with agentic research workflow
   * @param post Post information from database
   * @param styleConfig Style configuration from project
   * @param maxIterations Maximum content improvement iterations (default: 4)
   * @param minQualityScore Minimum quality score to accept (default: 8)
   * @returns Complete content ready for publishing and iteration history
   */
  async generatePostContent(
    post: Post,
    styleConfig: StyleConfig,
    maxIterations: number = parseInt(process.env.MAX_CONTENT_ITERATIONS || '4'),
    minQualityScore: number = parseInt(process.env.MIN_QUALITY_SCORE || '8')
  ): Promise<{ content: Content; iterations: IterationHistory[] }> {
    try {
      console.log(`\n[Workflow] Starting content generation for: ${post.title}`);
      console.log(`[Workflow] Niche: ${post.fieldNiche || 'General'}`);
      console.log(`[Workflow] Keywords: ${post.keywords?.join(', ') || 'None'}`);

      // Step 1: Initial research
      console.log('\n[Workflow] Step 1: Performing initial research...');
      let research = await this.performResearch(post);

      // Step 2: Agentic assessment - do we need more research?
      console.log('\n[Workflow] Step 2: Assessing research quality...');
      const assessment = await this.contentService.assessResearchQuality(post.title, research);

      if (assessment.needsMore && this.maxResearchIterations > 1) {
        console.log('[Workflow] More research needed:', assessment.suggestion);
        console.log('[Workflow] 🔍 Activating DEEP RESEARCH mode (scraping + AI summarization)...');

        // Get configuration from env
        const numUrls = parseInt(process.env.RESEARCH_URLS_TO_SCRAPE || '3');
        const summaryTokens = parseInt(process.env.RESEARCH_SUMMARY_TOKENS || '500');

        // Scrape and enrich existing research results with full content
        research = await this.researchService.scrapeAndEnrichResults(
          research,
          this.contentService,
          numUrls,
          summaryTokens
        );

        console.log(`[Workflow] Deep research complete - enriched top ${numUrls} sources`);
        console.log(`[Workflow] Total sources: ${research.results.length}`);
      } else {
        console.log('[Workflow] Research quality is sufficient');
      }

      // Step 3: Synthesize research findings
      console.log('\n[Workflow] Step 3: Synthesizing research findings...');
      await this.contentService.synthesizeResearch(research);

      // Step 4: Generate content iteratively with quality improvements
      console.log('\n[Workflow] Step 4: Generating blog post content iteratively...');
      const minWordCount = parseInt(process.env.MIN_WORD_COUNT || '1000');
      const targetWordCount = parseInt(process.env.TARGET_WORD_COUNT || '1500');

      const result = await this.contentService.generateContentIteratively(
        {
          title: post.title,
          fieldNiche: post.fieldNiche,
          keywords: post.keywords,
          research,
          styleConfig,
        },
        maxIterations,
        minQualityScore,
        minWordCount,
        targetWordCount
      );

      console.log('[Workflow] Content generation complete\n');

      return result;
    } catch (error) {
      console.error('[Workflow] Content generation failed:', error);
      throw new Error(
        `Workflow failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Perform comprehensive research for a post
   */
  private async performResearch(post: Post): Promise<ResearchResult> {
    const { title, fieldNiche, keywords } = post;

    try {
      // Main search
      const research = await this.researchService.search(title, fieldNiche, keywords, 10);

      // If we got very few results, try a news search as backup
      if (research.results.length < 3 && fieldNiche) {
        console.log('[Workflow] Few results found, searching news...');
        const newsResearch = await this.researchService.searchNews(fieldNiche, 5);
        return this.mergeResearch(research, newsResearch);
      }

      return research;
    } catch (error) {
      console.error('[Workflow] Research failed:', error);
      throw error;
    }
  }

  /**
   * Merge two research result sets
   */
  private mergeResearch(primary: ResearchResult, additional: ResearchResult): ResearchResult {
    // Deduplicate by URL
    const urlsSeen = new Set(primary.results.map((r) => r.url));
    const uniqueAdditional = additional.results.filter((r) => !urlsSeen.has(r.url));

    return {
      query: `${primary.query} + ${additional.query}`,
      results: [...primary.results, ...uniqueAdditional],
      timestamp: new Date(),
    };
  }

  /**
   * Validate generated content meets quality standards
   */
  validateContent(content: Content, minWords: number = 300): {
    valid: boolean;
    issues: string[];
  } {
    const issues: string[] = [];

    // Check title
    if (!content.title || content.title.trim().length === 0) {
      issues.push('Title is missing');
    }

    // Check body length
    const wordCount = content.body.split(/\s+/).length;
    if (wordCount < minWords) {
      issues.push(`Body is too short (${wordCount} words, minimum ${minWords})`);
    }

    // Check for sections/headings
    if (!content.body.includes('##') && !content.body.includes('<h2')) {
      issues.push('Content lacks proper sections/headings');
    }

    // Check tags
    if (!content.metadata.tags || content.metadata.tags.length === 0) {
      issues.push('No tags provided');
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }

  /**
   * Estimate reading time for content
   */
  estimateReadingTime(content: Content): number {
    const wordsPerMinute = 200;
    const wordCount = content.body.split(/\s+/).length;
    return Math.ceil(wordCount / wordsPerMinute);
  }

  /**
   * Get content statistics
   */
  getContentStats(content: Content): {
    wordCount: number;
    readingTime: number;
    headingCount: number;
    imageCount: number;
  } {
    const wordCount = content.body.split(/\s+/).length;
    const readingTime = this.estimateReadingTime(content);
    const headingCount = (content.body.match(/##/g) || []).length;
    const imageCount = content.images.length;

    return {
      wordCount,
      readingTime,
      headingCount,
      imageCount,
    };
  }
}
