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

  // Language name mapping (ISO 639-1 code → Full name)
  private static readonly LANGUAGE_NAMES: Record<string, string> = {
    en: 'English',
    es: 'Spanish',
    fr: 'French',
    de: 'German',
    it: 'Italian',
    pt: 'Portuguese',
    ru: 'Russian',
    ja: 'Japanese',
    zh: 'Chinese',
    ko: 'Korean',
    ar: 'Arabic',
    hi: 'Hindi',
    he: 'Hebrew',
    fa: 'Persian',
    tr: 'Turkish',
    pl: 'Polish',
    nl: 'Dutch',
    sv: 'Swedish',
    da: 'Danish',
    fi: 'Finnish',
    no: 'Norwegian',
    cs: 'Czech',
    hu: 'Hungarian',
    ro: 'Romanian',
    uk: 'Ukrainian',
    th: 'Thai',
    vi: 'Vietnamese',
    id: 'Indonesian',
    ms: 'Malay',
    bn: 'Bengali',
    ta: 'Tamil',
    te: 'Telugu',
    mr: 'Marathi',
    gu: 'Gujarati',
    kn: 'Kannada',
    ml: 'Malayalam',
    ur: 'Urdu',
  };

  // Right-to-left languages
  private static readonly RTL_LANGUAGES = new Set(['ar', 'he', 'fa', 'ur']);

  constructor(apiKey: string, model: string = 'gpt-4o') {
    if (!apiKey) {
      throw new Error('OpenAI API key is required');
    }

    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  /**
   * Get the full language name from ISO 639-1 code
   * @param code ISO 639-1 language code (e.g., 'en', 'es', 'ja')
   * @returns Full language name (e.g., 'English', 'Spanish', 'Japanese')
   */
  private getLanguageName(code: string): string {
    return ContentGenerationService.LANGUAGE_NAMES[code.toLowerCase()] || code.toUpperCase();
  }

  /**
   * Get script direction for a language
   * @param code ISO 639-1 language code
   * @returns 'rtl' for right-to-left languages, 'ltr' for left-to-right
   */
  private getScriptDirection(code: string): 'ltr' | 'rtl' {
    return ContentGenerationService.RTL_LANGUAGES.has(code.toLowerCase()) ? 'rtl' : 'ltr';
  }

  /**
   * Generate complete blog post content from research
   * @param request Content generation request with title, research, and style
   * @param language ISO 639-1 language code (e.g., 'en', 'es', 'ja')
   * @returns Platform-agnostic content object
   */
  async generateContent(request: ContentGenerationRequest, language: string = 'en'): Promise<Content> {
    try {
      const languageName = this.getLanguageName(language);
      console.log(`[Content Generation] Generating ${languageName} content for: ${request.title}`);

      // Build system and user prompts with language context
      const systemPrompt = this.buildSystemPrompt(request.styleConfig, language);
      const userPrompt = this.buildUserPrompt(request, language);

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

      console.log(`[Content Generation] ${languageName} content generated successfully`);

      // Parse and structure the content
      return this.parseGeneratedContent(generatedText, request, language);
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
   * @param language ISO 639-1 language code (e.g., 'en', 'es', 'ja')
   * @returns Final content and full iteration history
   */
  async generateContentIteratively(
    request: ContentGenerationRequest,
    maxIterations: number = 4,
    minScore: number = 8,
    minWordCount: number = 1000,
    targetWordCount: number = 1500,
    language: string = 'en'
  ): Promise<{ content: Content; iterations: IterationHistory[] }> {
    try {
      const languageName = this.getLanguageName(language);
      console.log(`\n[Content Generation] Starting iterative ${languageName} content generation...`);
      console.log(
        `[Content Generation] Max iterations: ${maxIterations}, Target score: ${minScore}+/10`
      );

      const iterations: IterationHistory[] = [];
      let currentContent: Content;
      let currentRating: QualityRating;

      // Iteration 1: Generate initial content
      console.log(`\n[Content Generation] === Iteration 1: Initial ${languageName} Generation ===`);
      currentContent = await this.generateContent(request, language);
      currentRating = await this.rateContent(
        currentContent,
        request.styleConfig,
        minWordCount,
        targetWordCount,
        request.research, // Pass research for actionable feedback
        undefined, // No previous score for first iteration
        language // Pass language for language-specific evaluation
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

      // Iterations 2-N: Improve until score >= minScore, AI decides to stop, or max iterations reached
      let currentResearch = request.research; // Track research that may be enhanced
      const MAX_SAFETY_ITERATIONS = 6; // Hard safety limit regardless of AI decisions

      for (let i = 2; i <= Math.min(maxIterations, MAX_SAFETY_ITERATIONS); i++) {
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
          iterations, // Pass iteration history for context
          language // Pass language for multilingual improvement
        );

        // Rate the improved content
        const previousRating = currentRating;
        currentRating = await this.rateContent(
          currentContent,
          request.styleConfig,
          minWordCount,
          targetWordCount,
          currentResearch, // Pass research for actionable feedback
          iterations[iterations.length - 1].rating.score, // Pass previous score for comparison
          language // Pass language for language-specific evaluation
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

        // AI decides whether to continue iterating (agentic decision)
        console.log('[Content Generation] Asking AI whether to continue iterating...');
        const decision = await this.decideContinueIteration(
          currentRating,
          previousRating,
          i,
          maxIterations,
          minScore
        );

        if (!decision.shouldContinue) {
          console.log(
            `[Content Generation] AI decided to STOP at iteration ${i} - ${decision.reasoning}`
          );
          break;
        }

        console.log(
          `[Content Generation] AI decided to CONTINUE - ${decision.reasoning}`
        );

        // If this was the last iteration
        if (i === Math.min(maxIterations, MAX_SAFETY_ITERATIONS)) {
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
   * @param blogTopic Optional topic context for more focused extraction
   * @returns Concise summary of key facts and insights
   */
  async summarizeWebContent(
    content: string,
    url: string,
    targetTokens: number = 500,
    blogTopic?: string
  ): Promise<string> {
    try {
      console.log(`[Content Generation] Summarizing content from ${url}`);

      const topicContext = blogTopic
        ? `\n**Blog Topic Context:** You are extracting information for a blog post about "${blogTopic}". Focus on facts, statistics, examples, and insights DIRECTLY relevant to this topic.\n`
        : '';

      const prompt = `
Extract key facts, statistics, examples, and insights from this web article.
Focus on information that would be valuable for creating high-quality blog content.${topicContext}
Source URL: ${url}

Content:
${content.slice(0, 12000)} ${content.length > 12000 ? '...[truncated]' : ''}

Instructions:
- Extract ONLY information relevant to the blog topic${blogTopic ? ` (${blogTopic})` : ''}
- Prioritize specific facts, numbers, and statistics with exact figures
- Include expert quotes or notable opinions with attribution
- Identify key insights, trends, and takeaways
- Note any case studies, real-world examples, or company names
- Keep the summary to approximately ${targetTokens} tokens
- Structure as bullet points for easy reference
- Always cite the source URL

Format:
**Key Facts:**
- [specific fact with numbers/dates]

**Statistics & Data:**
- [stat with exact figures and context]

**Case Studies & Examples:**
- [real-world example or company case]

**Expert Insights:**
- [quote or opinion with attribution]

**Source:** ${url}
      `.trim();

      const systemPrompt = blogTopic
        ? `You are a research assistant extracting information for a blog post about "${blogTopic}". Extract ONLY facts, statistics, examples, and insights directly relevant to this topic. Ignore generic or tangential content. Focus on concrete, citable information that will make the blog post authoritative and well-researched.`
        : 'You are a research assistant who extracts key information from web content for blog research.';

      const response = await this.client.chat.completions.create({
        model: 'gpt-4o-mini', // Hardcoded for cost efficiency (~$0.005 per URL)
        messages: [
          {
            role: 'system',
            content: systemPrompt,
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
   * Select the best content angle based on research findings
   * AI analyzes available information and chooses the most effective perspective
   * @param title Blog post title
   * @param research Research results
   * @returns Selected angle with reasoning
   */
  async selectContentAngle(
    title: string,
    research: ResearchResult
  ): Promise<{ angle: string; reasoning: string; focusAreas: string[] }> {
    try {
      console.log('[Content Generation] AI selecting content angle...');

      // Analyze research for patterns
      const hasStatistics = research.results.filter((r) =>
        /\d+%|\d+\s*(percent|million|billion|thousand)/i.test(r.snippet)
      ).length;
      const hasCaseStudies = research.results.filter((r) =>
        /company|organization|example|case study/i.test(r.snippet)
      ).length;
      const hasTrends = research.results.filter((r) =>
        /trend|future|growth|forecast|prediction/i.test(r.snippet)
      ).length;
      const hasHowTo = research.results.filter((r) =>
        /how to|guide|step|tutorial|implement/i.test(r.snippet)
      ).length;

      const prompt = `
You are a content strategist selecting the best angle/perspective for a blog post based on available research.

**Blog Title:** ${title}

**Research Analysis:**
- Total sources: ${research.results.length}
- Sources with statistics: ${hasStatistics}
- Sources with case studies/examples: ${hasCaseStudies}
- Sources about trends/future: ${hasTrends}
- How-to/guide sources: ${hasHowTo}

**Top Research Results:**
${research.results
  .slice(0, 8)
  .map(
    (r, i) => `
${i + 1}. ${r.title} (${r.source})
   ${r.snippet.slice(0, 200)}${r.snippet.length > 200 ? '...' : ''}
`
  )
  .join('')}

**Available Content Angles:**
1. **Data-Driven**: Focus on statistics, numbers, and quantitative evidence (best when: lots of statistics)
2. **Case Study/Example-Based**: Focus on real company examples and success stories (best when: strong case studies)
3. **Trend Analysis**: Focus on emerging trends and future predictions (best when: trend sources available)
4. **How-To/Practical Guide**: Focus on actionable steps and implementation (best when: procedural information)
5. **Balanced Overview**: Mix multiple perspectives (best when: diverse research but no dominant theme)

**Your Task:**
Choose the SINGLE best angle based on the research strength. Consider:
- What information do we have the MOST of?
- What would make the most authoritative, compelling post?
- What matches the blog title intent?

Respond in JSON:
{
  "angle": "Data-Driven" (or one of the other angles),
  "reasoning": "Why this angle is best (1 sentence)",
  "focusAreas": ["specific aspect 1", "specific aspect 2", "specific aspect 3"]
}

Example focusAreas for "Data-Driven": ["productivity statistics", "ROI measurements", "adoption rates"]
      `.trim();

      const response = await this.client.chat.completions.create({
        model: 'gpt-4o-mini', // Use mini for cost efficiency (~$0.005 per call)
        messages: [
          {
            role: 'system',
            content:
              'You are a content strategist who selects the best angle for blog posts based on available research. Choose angles that maximize the impact of available information. Respond only with valid JSON.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3, // Low temperature for consistent strategic decisions
        max_tokens: 250,
      });

      let angleText = response.choices[0]?.message?.content || '{}';

      // Strip markdown code blocks if present
      angleText = angleText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

      const selection = JSON.parse(angleText);

      console.log(`[Content Generation] ✓ Selected angle: ${selection.angle}`);
      console.log(`[Content Generation] Reasoning: ${selection.reasoning}`);
      console.log(`[Content Generation] Focus areas: ${selection.focusAreas?.join(', ')}`);

      return {
        angle: selection.angle || 'Balanced Overview',
        reasoning: selection.reasoning || 'Default angle selected',
        focusAreas: selection.focusAreas || [],
      };
    } catch (error) {
      console.error('[Content Generation] Angle selection failed:', error);
      // Fallback to balanced approach
      return {
        angle: 'Balanced Overview',
        reasoning: 'Selection failed, using default balanced approach',
        focusAreas: [],
      };
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
   * Decide whether to continue iterating based on current quality and improvement rate
   * Uses AI to make intelligent decisions about diminishing returns
   * @param currentRating Current quality rating
   * @param previousRating Previous quality rating (for comparison)
   * @param iterationNumber Current iteration number
   * @param maxIterations Maximum allowed iterations
   * @param targetScore Target quality score
   * @returns Decision to continue and reasoning
   */
  async decideContinueIteration(
    currentRating: QualityRating,
    previousRating: QualityRating | null,
    iterationNumber: number,
    maxIterations: number,
    targetScore: number
  ): Promise<{ shouldContinue: boolean; reasoning: string }> {
    try {
      // Calculate improvement rate if we have previous rating
      const improvementRate = previousRating
        ? currentRating.score - previousRating.score
        : null;

      const prompt = `
You are a content quality optimizer deciding whether to continue improving a blog post.

**Current Situation:**
- Iteration: ${iterationNumber}/${maxIterations}
- Current Score: ${currentRating.score}/10
${previousRating ? `- Previous Score: ${previousRating.score}/10` : ''}
${improvementRate !== null ? `- Improvement: ${improvementRate > 0 ? '+' : ''}${improvementRate.toFixed(1)} points` : ''}
- Target Score: ${targetScore}/10
- Word Count: ${currentRating.word_count}

**Current Feedback:**
${currentRating.feedback}

**Areas to Improve:**
${currentRating.areas_to_improve.join(', ') || 'None'}

**Your Task:**
Decide if another iteration would be valuable. Consider:
1. Is the improvement rate positive? (if no improvement last iteration, likely diminishing returns)
2. Is the score close to target? (within 0.5 points = good enough)
3. Are remaining issues fixable with one more iteration?
4. Have we hit max iterations?

Respond in JSON:
{
  "shouldContinue": true/false,
  "reasoning": "Brief explanation (1 sentence)"
}
      `.trim();

      const response = await this.client.chat.completions.create({
        model: 'gpt-4o-mini', // Use mini for cost efficiency (~$0.002 per decision)
        messages: [
          {
            role: 'system',
            content:
              'You are a content optimizer making smart decisions about when to stop iterating. Balance quality with efficiency. Respond only with valid JSON.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.2, // Low temperature for consistent decisions
        max_tokens: 150,
      });

      let decisionText = response.choices[0]?.message?.content || '{}';

      // Strip markdown code blocks if present
      decisionText = decisionText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

      const decision = JSON.parse(decisionText);

      console.log(
        `[Content Generation] AI Decision: ${decision.shouldContinue ? 'CONTINUE' : 'STOP'} - ${decision.reasoning}`
      );

      return {
        shouldContinue: decision.shouldContinue !== false,
        reasoning: decision.reasoning || 'No reasoning provided',
      };
    } catch (error) {
      console.warn(
        '[Content Generation] Iteration decision failed, defaulting to continue:',
        error
      );
      // Default to continuing if decision fails (safer than stopping prematurely)
      return {
        shouldContinue: iterationNumber < maxIterations,
        reasoning: 'Decision service failed, using default behavior',
      };
    }
  }

  /**
   * Plan research strategy - AI decides what queries to execute and in what order
   * Agentic research planning replaces template-based approach
   * @param title Blog post title
   * @param fieldNiche Optional niche/field context
   * @param keywords Optional keywords
   * @returns Ordered list of 2-4 research queries with reasoning
   */
  async planResearchStrategy(
    title: string,
    fieldNiche?: string,
    keywords?: string[]
  ): Promise<{ queries: string[]; strategy: string }> {
    try {
      console.log('[Content Generation] AI planning research strategy...');

      const currentYear = new Date().getFullYear();

      const prompt = `
You are a research strategist planning web searches for an authoritative blog post.

**Blog Post Details:**
- Title: ${title}
- Niche: ${fieldNiche || 'General'}
- Keywords: ${keywords?.join(', ') || 'None provided'}
- Current Year: ${currentYear}

**Your Task:**
Plan 2-4 targeted search queries that will gather comprehensive, high-quality information for this blog post.

**Strategy Guidelines:**
1. **Query Order Matters**:
   - Start broad (overview/trends) → then specific (statistics/examples)
   - OR start with facts/data → then case studies/applications
2. **Each Query Must Be Distinct**: Don't overlap - each should target different information
3. **Include Year for Recency**: Add "${currentYear}" to at least 2 queries
4. **Be Specific**: "software testing benefits statistics 2025" NOT just "software testing"
5. **Target Authority**: Queries should surface reputable sources (studies, reports, expert analysis)

**Examples of Good Query Plans:**
- Blog: "Why Remote Work Is Here to Stay"
  Queries: ["remote work productivity statistics 2025", "remote work trends future predictions", "successful remote work company case studies"]

- Blog: "The Rise of AI in Healthcare"
  Queries: ["AI healthcare statistics 2025", "AI medical diagnosis accuracy studies", "hospitals using AI real examples"]

Respond in JSON:
{
  "queries": ["query 1", "query 2", "query 3"],
  "strategy": "Brief explanation of your research approach (1 sentence)"
}
      `.trim();

      const response = await this.client.chat.completions.create({
        model: 'gpt-4o-mini', // Use mini for cost efficiency (~$0.005 per call)
        messages: [
          {
            role: 'system',
            content:
              'You are a research strategist who plans effective web search queries. Create targeted, specific queries that will gather authoritative information. Respond only with valid JSON.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.4, // Some creativity but mostly focused
        max_tokens: 300,
      });

      let planText = response.choices[0]?.message?.content || '{}';

      // Strip markdown code blocks if present
      planText = planText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

      const plan = JSON.parse(planText);

      const queries = plan.queries || [];

      if (queries.length === 0) {
        // Fallback to template-based if AI fails
        console.warn('[Content Generation] AI planning failed, using fallback');
        return {
          queries: [`${title} ${currentYear}`],
          strategy: 'Fallback to simple query',
        };
      }

      console.log(`[Content Generation] Research plan: ${queries.length} queries`);
      console.log(`[Content Generation] Strategy: ${plan.strategy}`);

      return {
        queries,
        strategy: plan.strategy || 'No strategy provided',
      };
    } catch (error) {
      console.error('[Content Generation] Research planning failed:', error);
      // Fallback to template-based approach
      const currentYear = new Date().getFullYear();
      return {
        queries: [`${title} ${fieldNiche || ''} ${currentYear}`.trim()],
        strategy: 'Fallback due to planning error',
      };
    }
  }

  /**
   * Assess if more research is needed (agentic decision with confidence scoring)
   * Stricter criteria and confidence-based decisions for better quality control
   */
  async assessResearchQuality(
    title: string,
    research: ResearchResult
  ): Promise<{ needsMore: boolean; confidence: number; suggestion?: string }> {
    try {
      // Analyze snippets for depth indicators
      const hasStatistics = research.results.some((r) =>
        /\d+%|\d+\s*(percent|million|billion|thousand)/i.test(r.snippet)
      );
      const hasDates = research.results.some((r) => /202[3-5]|2025/i.test(r.snippet));
      const avgSnippetLength =
        research.results.reduce((sum, r) => sum + r.snippet.length, 0) / research.results.length;

      const prompt = `
You are a STRICT research quality assessor. Evaluate if this research is sufficient for an authoritative 1000-1500 word blog post.

**Blog Title:** ${title}
**Number of sources:** ${research.results.length}
**Has statistics:** ${hasStatistics ? 'Yes' : 'No'}
**Has recent dates (2023-2025):** ${hasDates ? 'Yes' : 'No'}
**Avg snippet length:** ${avgSnippetLength.toFixed(0)} characters

**Sources:**
${research.results
  .map(
    (r, i) => `
${i + 1}. ${r.title} (${r.source})
   Snippet: ${r.snippet.slice(0, 150)}${r.snippet.length > 150 ? '...' : ''}
`
  )
  .join('')}

**Evaluation Criteria (be STRICT):**
1. **Quantity**: 7+ sources with good variety? (20% weight)
2. **Depth**: Snippets have specific facts, numbers, examples? Not just generic statements? (30% weight)
3. **Recency**: Recent dates (2023-2025) present? (20% weight)
4. **Diversity**: Multiple perspectives/sources, not all the same angle? (15% weight)
5. **Authority**: Reputable sources (not just blogs)? (15% weight)

**Confidence Score:**
- 80-100%: Excellent research, sufficient for authoritative content
- 60-79%: Good but could benefit from deep research (scraping)
- 0-59%: Insufficient, deep research REQUIRED

Respond in JSON:
{
  "needsMore": true/false,
  "confidence": 75,
  "reasoning": "Brief explanation of score",
  "suggestion": "What specific information is missing (if needsMore=true)"
}
      `.trim();

      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content:
              'You are a STRICT content strategist who ensures research quality. Be critical - only give high confidence if research is truly comprehensive. Respond only with valid JSON.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 250,
      });

      let assessmentText = response.choices[0]?.message?.content || '{}';

      // Strip markdown code blocks if present
      assessmentText = assessmentText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

      const result = JSON.parse(assessmentText);

      const confidence = result.confidence || 50;

      console.log(
        `[Content Generation] Research confidence: ${confidence}% - ${result.reasoning || 'No reasoning provided'}`
      );

      return {
        needsMore: result.needsMore !== false,
        confidence,
        suggestion: result.suggestion,
      };
    } catch (error) {
      console.warn('[Content Generation] Research quality assessment failed, assuming OK');
      return { needsMore: false, confidence: 70 };
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
    previousScore?: number,
    language: string = 'en'
  ): Promise<QualityRating> {
    try {
      const languageName = this.getLanguageName(language);
      console.log(`[Content Generation] Rating ${languageName} content quality...`);

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

      // Language-specific quality criteria
      let languageCriteria = '';
      if (language !== 'en') {
        languageCriteria = `
**CRITICAL LANGUAGE-SPECIFIC EVALUATION FOR ${languageName.toUpperCase()}:**
1. **Language Purity** (10% weight): Is the content 100% in ${languageName}? No English mixing? No untranslated words?
2. **Cultural Appropriateness** (15% weight): Are examples, idioms, and references suitable for ${languageName} speakers? Not just direct translations from English?
3. **Grammar & Style** (15% weight): Proper ${languageName} grammar, punctuation, and writing conventions? Natural flow?
4. **Citation Style** (5% weight): Are sources cited using natural ${languageName} phrasing (not "according to")?

`;
      }

      const prompt = `
You are a strict content quality assessor using Self-Refine methodology.
${language !== 'en' ? `You are evaluating ${languageName} content.` : ''}

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
- Issue (What's wrong - be specific!${language !== 'en' ? ` Include language quality issues like English mixing, poor grammar, or cultural mismatch` : ''})
- Action (HOW to fix it - reference which research source to use)

${languageCriteria}
Evaluate on these criteria (each scored 1-10):
1. **Word Count** (${minWordCount}-${targetWordCount} is ideal)
2. **Structure** (Clear intro/body/conclusion with subheadings)
3. **Depth** (Research-backed insights with citations, not generic claims)
4. **Engagement** (Hook, readability, actionable advice${language !== 'en' ? `, culturally appropriate for ${languageName} audience` : ''})

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
    iterationHistory?: IterationHistory[],
    language: string = 'en'
  ): Promise<Content> {
    try {
      const languageName = this.getLanguageName(language);
      console.log(`[Content Generation] Improving ${languageName} content based on feedback...`);
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

      // Build improvement prompt with language context
      const systemPrompt = this.buildSystemPrompt(styleConfig, language);

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
Rewrite the blog post${language !== 'en' ? ` in ${languageName.toUpperCase()}` : ''} to address EVERY improvement listed above.

For each improvement:
- Find the exact location mentioned
- Apply the specific action described
- Use the referenced research source
- Add substantial content (not minor tweaks)${language !== 'en' ? `\n- Ensure ALL content remains in ${languageName} (no English mixing)` : ''}

Goal: 1200+ words with specific statistics, examples, and citations. Score 8+/10${language !== 'en' ? `. CRITICAL: Output must be 100% in ${languageName}.` : '.'}
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
   * Build system prompt based on style configuration and language
   */
  private buildSystemPrompt(styleConfig: StyleConfig, language: string = 'en'): string {
    const tone = styleConfig.tone || 'professional';
    const length = styleConfig.length || 'medium';
    const languageName = this.getLanguageName(language);
    const scriptDirection = this.getScriptDirection(language);

    // Base multilingual instructions (applied to all non-English languages)
    let multilingualInstructions = '';
    if (language !== 'en') {
      multilingualInstructions = `
🌍 CRITICAL MULTILINGUAL INSTRUCTIONS FOR ${languageName.toUpperCase()}:
1. Write ENTIRELY in ${languageName} - do not mix languages or include English words
2. Use culturally appropriate examples and references for ${languageName} speakers
3. Follow ${scriptDirection} script conventions (${scriptDirection === 'rtl' ? 'right-to-left writing' : 'left-to-right writing'})
4. Use ${languageName}-specific idioms and expressions (avoid direct English translations)
5. Apply proper grammar, punctuation, and formatting for ${languageName}
6. When citing sources, use natural ${languageName} phrasing (e.g., "según [fuente]" in Spanish, not "according to")
7. Numbers, dates, and measurements should follow ${languageName} regional conventions

${styleConfig.languageInstructions ? `\n📝 Language-specific guidance: ${styleConfig.languageInstructions}` : ''}
${styleConfig.culturalConsiderations ? `\n🌏 Cultural context: ${styleConfig.culturalConsiderations}` : ''}
`;
    }

    return `
You are an expert blog writer specializing in creating engaging, well-researched content in ${languageName}.
${multilingualInstructions}
Writing style:
- Tone: ${tone}
- Length: ${length} (short: 300-500 words, medium: 500-800 words, long: 800-1200 words)
- Format: Use markdown with proper headings (##, ###), lists, and emphasis
- Structure: Include introduction, body with subheadings, and conclusion
- Quality: Informative, engaging, SEO-friendly, and based on research provided
- Language: 100% ${languageName} (no mixing with other languages)

${styleConfig.customInstructions ? `Additional instructions: ${styleConfig.customInstructions}` : ''}

Always cite sources when using specific facts or statistics.
    `.trim();
  }

  /**
   * Build user prompt with title, research, and AI-selected content angle
   */
  private buildUserPrompt(request: ContentGenerationRequest, language: string = 'en'): string {
    const { title, fieldNiche, keywords, research, contentAngle } = request;
    const languageName = this.getLanguageName(language);

    let prompt = `Write a comprehensive blog post ${language !== 'en' ? `in ${languageName.toUpperCase()}` : ''} with the following details:\n\n`;
    prompt += `Title${language !== 'en' ? ` (translate naturally to ${languageName})` : ''}: ${title}\n`;

    if (fieldNiche) {
      prompt += `Niche: ${fieldNiche}\n`;
    }

    if (keywords && keywords.length > 0) {
      prompt += `Keywords to include: ${keywords.join(', ')}\n`;
    }

    // Add content angle guidance (agentic)
    if (contentAngle) {
      prompt += `\n📐 CONTENT ANGLE: ${contentAngle.angle}\n`;
      prompt += `Why this angle: ${contentAngle.reasoning}\n`;
      if (contentAngle.focusAreas.length > 0) {
        prompt += `Focus on these aspects: ${contentAngle.focusAreas.join(', ')}\n`;
      }
      prompt += `\n⚠️ IMPORTANT: Structure your entire post around this "${contentAngle.angle}" angle. `;

      // Add angle-specific instructions
      switch (contentAngle.angle) {
        case 'Data-Driven':
          prompt += 'Lead with statistics, emphasize numbers and quantitative evidence throughout.';
          break;
        case 'Case Study/Example-Based':
          prompt += 'Lead with real examples, feature specific companies and success stories.';
          break;
        case 'Trend Analysis':
          prompt += 'Lead with emerging trends, emphasize future predictions and market shifts.';
          break;
        case 'How-To/Practical Guide':
          prompt += 'Lead with actionable steps, provide clear implementation guidance.';
          break;
        default:
          prompt += 'Balance multiple perspectives while maintaining depth.';
      }
      prompt += '\n';
    }

    if (research && research.results.length > 0) {
      prompt += `\nResearch findings${language !== 'en' ? ' (may be in English or other languages - synthesize into ' + languageName + ')' : ''}:\n`;
      research.results.forEach((r, i) => {
        prompt += `\n${i + 1}. ${r.title}\n   Source: ${r.source}\n   ${r.snippet}\n`;
      });
    }

    // Language-specific final instructions
    const languageReminder =
      language !== 'en'
        ? `\n\n🚨 CRITICAL: The ENTIRE blog post must be written in ${languageName.toUpperCase()} - no English words allowed except for proper nouns (company names, etc.). Translate the title naturally, use ${languageName}-native examples and references, and follow ${languageName} cultural norms.\n`
        : '';

    prompt += `${languageReminder}\nGenerate a well-structured blog post in markdown format. Include:
1. An engaging introduction that hooks the reader${contentAngle ? ` (aligned with ${contentAngle.angle} angle)` : ''}
2. Multiple body sections with descriptive subheadings
3. Insights and analysis based on the research${contentAngle && contentAngle.focusAreas.length > 0 ? ` (focusing on: ${contentAngle.focusAreas.join(', ')})` : ''}
4. Practical takeaways or actionable advice where relevant
5. A strong conclusion

Use the research findings to support your points and cite sources inline${language !== 'en' ? ` (e.g., use natural ${languageName} phrasing, not direct English translation of "according to")` : ' (e.g., "according to [source]")'}.
`;

    return prompt;
  }

  /**
   * Generate SEO metadata for multilingual content
   * @param content Generated content
   * @param language ISO 639-1 language code
   * @param regionalVariant Optional regional variant (e.g., 'es-MX', 'zh-CN')
   * @returns SEO metadata with localized keywords and descriptions
   */
  async generateSEOMetadata(
    content: Content,
    language: string = 'en',
    _regionalVariant?: string
  ): Promise<{ localizedKeywords: string[]; metaDescription: string; ogLocale: string }> {
    try {
      const languageName = this.getLanguageName(language);
      console.log(`[Content Generation] Generating ${languageName} SEO metadata...`);

      const prompt = `
Generate SEO metadata for this ${languageName} blog post.

Title: ${content.title}
Content Preview: ${content.body.slice(0, 500)}...

Your task:
1. Generate 5-10 localized keywords that ${languageName} speakers would actually search for
2. Create a meta description (150-160 characters in ${languageName})
3. Suggest an Open Graph locale code (e.g., "es_ES", "ja_JP", "en_US")

IMPORTANT:
- Keywords must be in ${languageName} and reflect how native speakers search
- Meta description must be compelling and in ${languageName}
- Focus on search intent and local search behavior

Respond in JSON:
{
  "localizedKeywords": ["keyword 1", "keyword 2", ...],
  "metaDescription": "Compelling description in ${languageName} (150-160 chars)",
  "ogLocale": "language_REGION"
}
      `.trim();

      const response = await this.client.chat.completions.create({
        model: 'gpt-4o-mini', // Use mini for cost efficiency (~$0.005 per call)
        messages: [
          {
            role: 'system',
            content: `You are an SEO expert specializing in ${languageName} content optimization. Generate metadata that will perform well in ${languageName} search engines. Respond only with valid JSON.`,
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3, // Low temperature for consistent SEO decisions
        max_tokens: 300,
      });

      let seoText = response.choices[0]?.message?.content || '{}';

      // Strip markdown code blocks if present
      seoText = seoText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

      const seoMetadata = JSON.parse(seoText);

      console.log(
        `[Content Generation] ✓ Generated SEO: ${seoMetadata.localizedKeywords?.length || 0} keywords, ${seoMetadata.metaDescription?.length || 0} char description`
      );

      return {
        localizedKeywords: seoMetadata.localizedKeywords || [],
        metaDescription: seoMetadata.metaDescription || content.title,
        ogLocale: seoMetadata.ogLocale || `${language}_${language.toUpperCase()}`,
      };
    } catch (error) {
      console.error(`[Content Generation] SEO metadata generation failed:`, error);
      // Return fallback SEO metadata
      return {
        localizedKeywords: content.metadata.tags || [],
        metaDescription: content.title.slice(0, 160),
        ogLocale: `${language}_${language.toUpperCase()}`,
      };
    }
  }

  /**
   * Parse generated content and create structured Content object
   */
  private parseGeneratedContent(
    generatedText: string,
    request: ContentGenerationRequest,
    language: string = 'en'
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
        language, // Store the language code
        customFields: {
          fieldNiche: request.fieldNiche,
          generated: true,
          researchQuery: request.research?.query,
        },
      },
    };
  }
}
