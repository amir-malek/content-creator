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
   * @param language ISO 639-1 language code (e.g., 'en', 'es', 'ja')
   * @param maxIterations Maximum content improvement iterations (default: 4)
   * @param minQualityScore Minimum quality score to accept (default: 8)
   * @returns Complete content ready for publishing and iteration history
   */
  async generatePostContent(
    post: Post,
    styleConfig: StyleConfig,
    language: string = 'en',
    maxIterations: number = parseInt(process.env.MAX_CONTENT_ITERATIONS || '4'),
    minQualityScore: number = parseInt(process.env.MIN_QUALITY_SCORE || '8')
  ): Promise<{ content: Content; iterations: IterationHistory[] }> {
    try {
      console.log(`\n[Workflow] Starting content generation for: ${post.title}`);
      console.log(`[Workflow] Language: ${language.toUpperCase()}`);
      console.log(`[Workflow] Niche: ${post.fieldNiche || 'General'}`);
      console.log(`[Workflow] Keywords: ${post.keywords?.join(', ') || 'None'}`);

      // Step 1: Initial research
      console.log('\n[Workflow] Step 1: Performing initial research...');
      let research = await this.performResearch(post);

      // Step 2: Agentic assessment - do we need more research?
      console.log('\n[Workflow] Step 2: Assessing research quality...');
      const assessment = await this.contentService.assessResearchQuality(post.title, research);

      // Get confidence threshold from env (default: 70%)
      const confidenceThreshold = parseInt(process.env.RESEARCH_CONFIDENCE_THRESHOLD || '70');

      console.log(
        `[Workflow] Research confidence: ${assessment.confidence}% (threshold: ${confidenceThreshold}%)`
      );

      if (assessment.confidence < confidenceThreshold && this.maxResearchIterations > 1) {
        console.log('[Workflow] ⚠️  Research confidence below threshold');
        console.log('[Workflow] Reason:', assessment.suggestion || 'Quality insufficient');
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
        console.log('[Workflow] ✓ Research confidence sufficient for content generation');
      }

      // Step 3: Synthesize research findings
      console.log('\n[Workflow] Step 3: Synthesizing research findings...');
      await this.contentService.synthesizeResearch(research);

      // Step 3.5: Select content angle (agentic decision)
      console.log('\n[Workflow] Step 3.5: Selecting content angle...');
      const contentAngle = await this.contentService.selectContentAngle(post.title, research);
      console.log(`[Workflow] 🎯 Content Angle: ${contentAngle.angle}`);
      console.log(`[Workflow] Focus: ${contentAngle.focusAreas.join(', ')}`);

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
          contentAngle, // Pass the AI-selected angle
        },
        maxIterations,
        minQualityScore,
        minWordCount,
        targetWordCount,
        language // Pass language for multilingual content generation
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
   * Perform comprehensive research for a post using AI-planned strategy
   * AI decides what queries to run and in what order (agentic research)
   */
  private async performResearch(post: Post): Promise<ResearchResult> {
    const { title, fieldNiche, keywords } = post;

    try {
      // Step 1: AI plans research strategy (2-4 targeted queries)
      const researchPlan = await this.contentService.planResearchStrategy(
        title,
        fieldNiche,
        keywords
      );

      console.log(`[Workflow] 📋 Research Strategy: ${researchPlan.strategy}`);
      console.log(
        `[Workflow] 🔍 Planned Queries: ${researchPlan.queries.map((q, i) => `\n   ${i + 1}. "${q}"`).join('')}`
      );

      // Step 2: Execute each planned query sequentially
      const allResults: ResearchResult[] = [];

      for (let i = 0; i < researchPlan.queries.length; i++) {
        const query = researchPlan.queries[i];
        console.log(`[Workflow] Executing query ${i + 1}/${researchPlan.queries.length}: "${query}"`);

        try {
          // Use the research service's search method directly with the AI-planned query
          const result = await this.researchService.search(query, undefined, undefined, 7);
          allResults.push(result);

          console.log(`[Workflow] ✓ Query ${i + 1} returned ${result.results.length} results`);
        } catch (error) {
          console.warn(`[Workflow] ⚠️  Query ${i + 1} failed:`, error);
          // Continue with other queries even if one fails
        }
      }

      // Step 3: Merge all research results
      if (allResults.length === 0) {
        throw new Error('All research queries failed');
      }

      let mergedResearch = allResults[0];
      for (let i = 1; i < allResults.length; i++) {
        mergedResearch = this.mergeResearch(mergedResearch, allResults[i]);
      }

      console.log(
        `[Workflow] ✓ Research complete: ${mergedResearch.results.length} total results from ${researchPlan.queries.length} queries`
      );

      return mergedResearch;
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
