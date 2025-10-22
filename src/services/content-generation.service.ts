// Content Generation Service - AI-powered content creation using OpenAI

import OpenAI from 'openai';
import { Content, ContentGenerationRequest, ResearchResult, StyleConfig } from '../types/index.js';

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

      const result = JSON.parse(response.choices[0]?.message?.content || '{}');

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
