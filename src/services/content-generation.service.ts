// Content Generation Service - AI-powered content creation using OpenAI

import OpenAI from 'openai';
import {
  Content,
  ContentGenerationRequest,
  ResearchResult,
  StyleConfig,
  QualityRating,
  IterationHistory,
} from '../types/index.js';

/**
 * Content generation service using OpenAI GPT-4o
 * Handles agentic content generation with research synthesis
 */
export class ContentGenerationService {
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model: string = 'gpt-4o') {
    if (!apiKey) {
      throw new Error('OpenAI API key is required');
    }

    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  /**
   * Generate complete blog post content from research
   * @param request Content generation request with title, research, and style
   * @returns Platform-agnostic content object
   */
  async generateContent(request: ContentGenerationRequest): Promise<Content> {
    try {
      console.log(`[Content Generation] Generating content for: ${request.title}`);

      // Build system and user prompts
      const systemPrompt = this.buildSystemPrompt(request.styleConfig);
      const userPrompt = this.buildUserPrompt(request);

      // Generate content using OpenAI
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 2000,
      });

      const generatedText = response.choices[0]?.message?.content;

      if (!generatedText) {
        throw new Error('No content generated from OpenAI');
      }

      console.log('[Content Generation] Content generated successfully');

      // Parse and structure the content
      return this.parseGeneratedContent(generatedText, request);
    } catch (error) {
      console.error('[Content Generation] Failed:', error);
      throw new Error(
        `Content generation failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Generate content iteratively with quality improvements
   * Main orchestrator for the iterative content improvement loop
   * @param request Content generation request
   * @param maxIterations Maximum number of iterations (default: 4)
   * @param minScore Minimum quality score to stop iterating (default: 8)
   * @returns Final content and full iteration history
   */
  async generateContentIteratively(
    request: ContentGenerationRequest,
    maxIterations: number = 4,
    minScore: number = 8,
    minWordCount: number = 1000,
    targetWordCount: number = 1500
  ): Promise<{ content: Content; iterations: IterationHistory[] }> {
    try {
      console.log('\n[Content Generation] Starting iterative content generation...');
      console.log(
        `[Content Generation] Max iterations: ${maxIterations}, Target score: ${minScore}+/10`
      );

      const iterations: IterationHistory[] = [];
      let currentContent: Content;
      let currentRating: QualityRating;

      // Iteration 1: Generate initial content
      console.log('\n[Content Generation] === Iteration 1: Initial Generation ===');
      currentContent = await this.generateContent(request);
      currentRating = await this.rateContent(
        currentContent,
        request.styleConfig,
        minWordCount,
        targetWordCount,
        request.research // Pass research for actionable feedback
      );

      iterations.push({
        iteration_number: 1,
        content: currentContent,
        rating: currentRating,
      });

      console.log(
        `[Content Generation] Iteration 1 complete - Score: ${currentRating.score}/10`
      );

      // Check if we should stop early
      if (currentRating.score >= minScore) {
        console.log(
          `[Content Generation] Quality score ${currentRating.score} meets target ${minScore} - stopping early`
        );
        return { content: currentContent, iterations };
      }

      // Iterations 2-N: Improve until score >= minScore or max iterations reached
      let currentResearch = request.research; // Track research that may be enhanced

      for (let i = 2; i <= maxIterations; i++) {
        console.log(`\n[Content Generation] === Iteration ${i}: Improvement ===`);
        console.log(
          `[Content Generation] Current score: ${currentRating.score}/10 (target: ${minScore}+)`
        );

        // Improve content based on previous rating
        if (!currentResearch) {
          console.warn('[Content Generation] No research available for improvement');
          break;
        }

        currentContent = await this.improveContent(
          currentContent,
          currentRating,
          currentResearch,
          request.styleConfig,
          iterations // Pass iteration history for context
        );

        // Rate the improved content
        currentRating = await this.rateContent(
          currentContent,
          request.styleConfig,
          minWordCount,
          targetWordCount,
          currentResearch, // Pass research for actionable feedback
          iterations[iterations.length - 1].rating.score // Pass previous score for comparison
        );

        iterations.push({
          iteration_number: i,
          content: currentContent,
          rating: currentRating,
        });

        console.log(
          `[Content Generation] Iteration ${i} complete - Score: ${currentRating.score}/10`
        );

        // Check if we've reached the target quality
        if (currentRating.score >= minScore) {
          console.log(
            `[Content Generation] Quality score ${currentRating.score} meets target ${minScore} - stopping`
          );
          break;
        }

        // If this was the last iteration
        if (i === maxIterations) {
          console.log(
            `[Content Generation] Reached max iterations (${maxIterations}) with score ${currentRating.score}/10`
          );
        }
      }

      console.log(
        `\n[Content Generation] Iterative generation complete - ${iterations.length} iterations`
      );
      console.log(
        `[Content Generation] Final score: ${currentRating.score}/10 (${currentRating.word_count} words)`
      );

      return {
        content: currentContent,
        iterations,
      };
    } catch (error) {
      console.error('[Content Generation] Iterative generation failed:', error);
      throw new Error(
        `Iterative content generation failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Summarize web content into key facts for research enrichment
   * Uses GPT-4o-mini for cost efficiency
   * @param content Full web page content
   * @param url Source URL for reference
   * @param targetTokens Target summary size (400-600 recommended)
   * @returns Concise summary of key facts and insights
   */
  async summarizeWebContent(content: string, url: string, targetTokens: number = 500): Promise<string> {
    try {
      console.log(`[Content Generation] Summarizing content from ${url}`);

      const prompt = `
Extract key facts, statistics, examples, and insights from this web article.
Focus on information that would be valuable for creating high-quality blog content.

Source URL: ${url}

Content:
${content.slice(0, 12000)} ${content.length > 12000 ? '...[truncated]' : ''}

Instructions:
- Extract specific facts, numbers, and statistics
- Include expert quotes or notable opinions
- Identify key insights and takeaways
- Note any examples or case studies
- Keep the summary to approximately ${targetTokens} tokens
- Structure as bullet points for easy reference
- Always attribute information to the source URL

Format:
**Key Facts:**
- [fact 1]
- [fact 2]

**Statistics & Data:**
- [stat 1]
- [stat 2]

**Insights & Takeaways:**
- [insight 1]
- [insight 2]

**Source:** ${url}
      `.trim();

      const response = await this.client.chat.completions.create({
        model: 'gpt-4o-mini', // Hardcoded for cost efficiency (~$0.005 per URL)
        messages: [
          {
            role: 'system',
            content:
              'You are a research assistant who extracts key information from web content for blog research.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3, // Low temperature for factual extraction
        max_tokens: Math.floor(targetTokens * 1.5), // Allow some overhead
      });

      const summary = response.choices[0]?.message?.content || '';

      if (!summary) {
        throw new Error('No summary generated');
      }

      console.log(`[Content Generation] Extracted ${summary.length} characters from ${url}`);
      return summary;
    } catch (error) {
      console.error(`[Content Generation] Failed to summarize ${url}:`, error);
      // Return a fallback message instead of throwing - allows partial success
      return `[Failed to extract content from ${url}]`;
    }
  }

  /**
   * Analyze research results and synthesize key insights
   * This is part of the agentic workflow
   */
  async synthesizeResearch(research: ResearchResult): Promise<string> {
    try {
      console.log('[Content Generation] Synthesizing research');

      const prompt = `
You are a research analyst. Analyze the following search results and synthesize the key insights, facts, and trends.

Query: ${research.query}

Results:
${research.results
  .map(
    (r, i) => `
${i + 1}. ${r.title}
   Source: ${r.source}
   ${r.snippet}
`
  )
  .join('\n')}

Provide a concise synthesis (2-3 paragraphs) highlighting:
1. Key facts and statistics
2. Current trends or developments
3. Expert opinions or notable quotes
4. Any conflicting viewpoints

Be factual and cite sources where possible.
      `.trim();

      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: 'You are a research analyst who synthesizes information from multiple sources.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.5,
        max_tokens: 800,
      });

      const synthesis = response.choices[0]?.message?.content || '';

      console.log('[Content Generation] Research synthesized');

      return synthesis;
    } catch (error) {
      console.error('[Content Generation] Research synthesis failed:', error);
      throw new Error(
        `Research synthesis failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Assess if more research is needed (agentic decision)
   */
  async assessResearchQuality(
    title: string,
    research: ResearchResult
  ): Promise<{ needsMore: boolean; suggestion?: string }> {
    try {
      const prompt = `
Assess the quality and completeness of this research for writing a blog post.

Title: ${title}
Number of sources: ${research.results.length}

Results summary:
${research.results.map((r) => `- ${r.title} (${r.source})`).join('\n')}

Answer in JSON format:
{
  "needsMore": true/false,
  "suggestion": "what additional research would help (if needsMore is true)"
}
      `.trim();

      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content:
              'You are a content strategist assessing research quality. Respond only with valid JSON.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 200,
      });

      let assessmentText = response.choices[0]?.message?.content || '{}';

      // Strip markdown code blocks if present
      assessmentText = assessmentText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

      const result = JSON.parse(assessmentText);

      return {
        needsMore: result.needsMore || false,
        suggestion: result.suggestion,
      };
    } catch (error) {
      console.warn('[Content Generation] Research quality assessment failed, assuming OK');
      return { needsMore: false };
    }
  }

  /**
   * Rate content quality using AI evaluation with Self-Refine methodology
   * Provides specific, actionable, paragraph-level feedback
   */
  async rateContent(
    content: Content,
    _styleConfig: StyleConfig,
    minWordCount: number = 1000,
    targetWordCount: number = 1500,
    research?: ResearchResult,
    previousScore?: number
  ): Promise<QualityRating> {
    try {
      console.log('[Content Generation] Rating content quality...');

      const wordCount = content.body.split(/\s+/).length;

      // Build research sources reference
      let researchSection = '';
      if (research && research.results.length > 0) {
        researchSection = `

**Available Research Sources:**
${research.results
  .map(
    (r, i) => `
Source #${i + 1}: ${r.title}
   ${r.snippet}
`
  )
  .join('\n')}`;
      }

      const prompt = `
You are a strict content quality assessor using Self-Refine methodology.

**IMPORTANT**: Provide SPECIFIC, ACTIONABLE feedback. For each issue:
1. LOCALIZE: Identify the exact paragraph/section
2. DIAGNOSE: Explain what's wrong
3. PRESCRIBE: Give concrete action with source reference

${previousScore ? `**CONTEXT**: Previous iteration scored ${previousScore}/10. If content has improved (more words, better citations, added examples), INCREASE the score to reflect that progress.` : ''}

Title: ${content.title}
Word Count: ${wordCount} (target: ${minWordCount}-${targetWordCount})

Content Body:
${content.body}
${researchSection}

**Your Task:**
Analyze the content paragraph-by-paragraph. For EACH weak paragraph, provide:
- Location (e.g., "Paragraph 2", "Introduction", "Section: Quality Metrics")
- Issue (What's wrong - be specific!)
- Action (HOW to fix it - reference which research source to use)

Evaluate on these criteria (each scored 1-10):
1. **Word Count** (${minWordCount}-${targetWordCount} is ideal)
2. **Structure** (Clear intro/body/conclusion with subheadings)
3. **Depth** (Research-backed insights with citations, not generic claims)
4. **Engagement** (Hook, readability, actionable advice)

Provide assessment in this JSON format:
{
  "score": 7.5,
  "feedback": "2-3 sentence summary",
  "areas_to_improve": ["Word Count", "Depth"],
  "actionable_improvements": [
    {
      "location": "Paragraph 2",
      "issue": "Makes unsupported claim 'testing improves quality' without evidence",
      "action": "Add the 47% improvement statistic from Source #3",
      "source_reference": "Source #3"
    }
  ],
  "word_count": ${wordCount},
  "structure_score": 8.0,
  "depth_score": 6.0,
  "engagement_score": 7.5
}

Be VERY critical. Score 8+ means publication-ready. Provide at least 2-3 actionable improvements.
      `.trim();

      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content:
              'You are a strict content quality assessor using Self-Refine methodology. Provide SPECIFIC, ACTIONABLE feedback with exact paragraph locations and source references. Respond only with valid JSON.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 1000, // Increased for detailed actionable improvements
      });

      let ratingText = response.choices[0]?.message?.content || '{}';

      // Strip markdown code blocks if present (AI sometimes wraps JSON in ```json...```)
      ratingText = ratingText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

      const rating = JSON.parse(ratingText);

      console.log(
        `[Content Generation] Quality score: ${rating.score}/10 (${wordCount} words)`
      );

      // DEBUG: Log actionable improvements for visibility
      if (rating.actionable_improvements && rating.actionable_improvements.length > 0) {
        console.log(`[Content Generation] ${rating.actionable_improvements.length} specific improvements identified`);
        console.log('\n[DEBUG] Sample Actionable Improvements:');
        rating.actionable_improvements.slice(0, 3).forEach((imp: any, i: number) => {
          console.log(`  ${i + 1}. Location: "${imp.location}"`);
          console.log(`     Issue: "${imp.issue}"`);
          console.log(`     Action: "${imp.action}"`);
          if (imp.source_reference) {
            console.log(`     Source: ${imp.source_reference}`);
          }
        });
        if (rating.actionable_improvements.length > 3) {
          console.log(`  ... and ${rating.actionable_improvements.length - 3} more\n`);
        }
      } else {
        console.log('[DEBUG] ⚠️  NO actionable improvements generated!');
      }

      return {
        score: rating.score || 5,
        feedback: rating.feedback || 'No feedback provided',
        areas_to_improve: rating.areas_to_improve || [],
        actionable_improvements: rating.actionable_improvements || [],
        word_count: wordCount,
        structure_score: rating.structure_score || 5,
        depth_score: rating.depth_score || 5,
        engagement_score: rating.engagement_score || 5,
      };
    } catch (error) {
      console.error('[Content Generation] Content rating failed:', error);
      // Return a neutral rating on error
      return {
        score: 6,
        feedback: 'Rating failed - using default score',
        areas_to_improve: ['Unable to assess quality'],
        actionable_improvements: [],
        word_count: content.body.split(/\s+/).length,
        structure_score: 6,
        depth_score: 6,
        engagement_score: 6,
      };
    }
  }

  /**
   * Improve content based on quality rating feedback (Self-Refine methodology)
   * Uses specific, actionable improvements and iteration history
   */
  async improveContent(
    previousContent: Content,
    rating: QualityRating,
    research: ResearchResult,
    styleConfig: StyleConfig,
    iterationHistory?: IterationHistory[]
  ): Promise<Content> {
    try {
      console.log('[Content Generation] Improving content based on feedback...');
      console.log(`[Content Generation] ${rating.actionable_improvements.length} actionable improvements to apply`);

      // DEBUG: Log improvements being applied
      if (rating.actionable_improvements.length > 0) {
        console.log('\n[DEBUG] Applying these improvements:');
        rating.actionable_improvements.slice(0, 2).forEach((imp: any, i: number) => {
          console.log(`  ${i + 1}. ${imp.location}: ${imp.action}`);
        });
        if (rating.actionable_improvements.length > 2) {
          console.log(`  ... and ${rating.actionable_improvements.length - 2} more`);
        }
      }

      // Build improvement prompt
      const systemPrompt = this.buildSystemPrompt(styleConfig);

      // Build iteration history context
      let historyContext = '';
      if (iterationHistory && iterationHistory.length > 1) {
        historyContext = `

**📊 Iteration History (What You've Tried):**
${iterationHistory.map((iter) => `
Iteration ${iter.iteration_number}: Score ${iter.rating.score}/10
  - Word Count: ${iter.rating.word_count}
  - What was tried: ${iter.rating.areas_to_improve.join(', ')}
`).join('')}

Learn from previous attempts. Try a DIFFERENT approach this time.`;
      }

      // Build actionable improvements section
      let improvementsSection = '';
      if (rating.actionable_improvements && rating.actionable_improvements.length > 0) {
        improvementsSection = `

**🎯 SPECIFIC IMPROVEMENTS TO MAKE:**
${rating.actionable_improvements.map((improvement, i) => `
${i + 1}. **${improvement.location}**
   - Issue: ${improvement.issue}
   - Action: ${improvement.action}
   ${improvement.source_reference ? `- Use: ${improvement.source_reference}` : ''}
`).join('')}

These are PRECISE instructions. Follow them exactly.`;
      }

      const improvementPrompt = `
You previously wrote a blog post that scored ${rating.score}/10 (current: ${rating.word_count} words).
${historyContext}

**Previous Content:**
${previousContent.body}

${improvementsSection}

**Available Research:**
${research.results
  .map(
    (r, i) => `
${i + 1}. ${r.title} (${r.source})
   ${r.snippet}
`
  )
  .join('\n')}

**Your Task:**
Rewrite the blog post to address EVERY improvement listed above.

For each improvement:
- Find the exact location mentioned
- Apply the specific action described
- Use the referenced research source
- Add substantial content (not minor tweaks)

Goal: 1200+ words with specific statistics, examples, and citations. Score 8+/10.
      `.trim();

      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: improvementPrompt },
        ],
        temperature: 0.7,
        max_tokens: 3500, // Allow more tokens for longer content (1200-1500 words)
      });

      const improvedText = response.choices[0]?.message?.content;

      if (!improvedText) {
        throw new Error('No improved content generated from OpenAI');
      }

      console.log('[Content Generation] Content improved successfully');

      // Parse and structure the improved content
      return {
        title: previousContent.title,
        body: improvedText,
        images: previousContent.images, // Keep existing images
        metadata: {
          ...previousContent.metadata,
          customFields: {
            ...previousContent.metadata.customFields,
            improved: true,
            previousScore: rating.score,
          },
        },
      };
    } catch (error) {
      console.error('[Content Generation] Content improvement failed:', error);
      throw new Error(
        `Content improvement failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Build system prompt based on style configuration
   */
  private buildSystemPrompt(styleConfig: StyleConfig): string {
    const tone = styleConfig.tone || 'professional';
    const length = styleConfig.length || 'medium';

    return `
You are an expert blog writer specializing in creating engaging, well-researched content.

Writing style:
- Tone: ${tone}
- Length: ${length} (short: 300-500 words, medium: 500-800 words, long: 800-1200 words)
- Format: Use markdown with proper headings (##, ###), lists, and emphasis
- Structure: Include introduction, body with subheadings, and conclusion
- Quality: Informative, engaging, SEO-friendly, and based on research provided

${styleConfig.customInstructions ? `Additional instructions: ${styleConfig.customInstructions}` : ''}

Always cite sources when using specific facts or statistics.
    `.trim();
  }

  /**
   * Build user prompt with title and research
   */
  private buildUserPrompt(request: ContentGenerationRequest): string {
    const { title, fieldNiche, keywords, research } = request;

    let prompt = `Write a comprehensive blog post with the following details:\n\n`;
    prompt += `Title: ${title}\n`;

    if (fieldNiche) {
      prompt += `Niche: ${fieldNiche}\n`;
    }

    if (keywords && keywords.length > 0) {
      prompt += `Keywords to include: ${keywords.join(', ')}\n`;
    }

    if (research && research.results.length > 0) {
      prompt += `\nResearch findings:\n`;
      research.results.forEach((r, i) => {
        prompt += `\n${i + 1}. ${r.title}\n   Source: ${r.source}\n   ${r.snippet}\n`;
      });
    }

    prompt += `\n\nGenerate a well-structured blog post in markdown format. Include:
1. An engaging introduction that hooks the reader
2. Multiple body sections with descriptive subheadings
3. Insights and analysis based on the research
4. Practical takeaways or actionable advice where relevant
5. A strong conclusion

Use the research findings to support your points and cite sources inline (e.g., "according to [source]").
`;

    return prompt;
  }

  /**
   * Parse generated content and create structured Content object
   */
  private parseGeneratedContent(
    generatedText: string,
    request: ContentGenerationRequest
  ): Content {
    // For now, we'll create a simple structure
    // In production, you might want more sophisticated parsing

    return {
      title: request.title,
      body: generatedText,
      images: [], // Images will be added by the image service
      metadata: {
        tags: request.keywords || [],
        publishDate: new Date(),
        customFields: {
          fieldNiche: request.fieldNiche,
          generated: true,
          researchQuery: request.research?.query,
        },
      },
    };
  }
}
