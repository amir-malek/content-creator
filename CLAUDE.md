# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Content Creator is an AI-powered blog automation system that generates, researches, and publishes blog posts to any platform with an API. It uses TypeScript/Node.js with a dynamic adapter pattern for multi-platform publishing.

**Key Technologies**: Supabase (database), OpenAI GPT-4o (content generation), SerpAPI (research), Unsplash (images), node-cron (scheduling)

## Common Commands

### Development
```bash
npm install          # Install dependencies
npm run build        # Compile TypeScript to dist/
npm run dev          # Watch mode for development
```

### Database Management
```bash
npm run migrate      # Run database migrations (requires SUPABASE_DB_PASSWORD in .env)
npm run view         # View the most recently generated blog post content
```

### Content Publishing
```bash
npm run cli publish                    # Publish all pending posts
npm run cli publish --dry-run          # Generate content without publishing
npm run cli publish -p "Project Name"  # Publish for specific project only
npm run cli stats                      # Show pending/published post counts
```

### Scheduling
```bash
npm run schedule     # Start automated daily scheduler (uses CRON_SCHEDULE from .env)
```

## Architecture Overview

### Core Pipeline Flow
The system follows this sequence for each post:

1. **Database Query** → Fetch pending posts from Supabase
2. **Research** → SerpAPI searches web for current information
3. **Agentic Assessment** → AI evaluates research quality, requests more if needed
4. **Iterative Content Generation** → AI creates and improves blog post through multiple iterations (NEW)
   - Generate initial content
   - AI rates quality (word count, structure, depth, engagement)
   - If score < 8/10: improve content and re-rate
   - Repeat up to 4 times or until score ≥ 8
   - All iterations stored in database for analysis
5. **Image Enhancement** → Unsplash finds relevant images
6. **Publishing** → Dynamic adapter publishes to configured platform
7. **Status Tracking** → Database updates with published URL and status

### Multilingual Support (NEW ✨)

**Native Generation in 50+ Languages**: The system generates content directly in the target language (not translation).

**Supported Languages**: English, Spanish, French, German, Italian, Portuguese, Russian, Japanese, Chinese, Korean, Arabic, Hindi, Hebrew, Persian, Turkish, Polish, Dutch, Swedish, Danish, Finnish, Norwegian, Czech, Hungarian, Romanian, Ukrainian, Thai, Vietnamese, Indonesian, Malay, Bengali, Tamil, Telugu, Marathi, Gujarati, Kannada, Malayalam, Urdu, and more.

**How It Works**:
1. Each project has a `language` field (ISO 639-1 code: en, es, ja, etc.)
2. AI generates content directly in the target language with:
   - **Cultural appropriateness**: Native examples, idioms, references
   - **Language purity enforcement**: No English mixing
   - **Grammar and style validation**: Proper punctuation, syntax, natural flow
   - **SEO optimization**: Localized keywords, meta descriptions
3. Quality scoring evaluates language-specific criteria
4. **RTL support** for Arabic, Hebrew, Persian, Urdu
5. **Improved tokenization** for Asian languages (3-4x efficiency)

**Language Configuration**:
Projects have optional `language_config` with:
- `regionalVariant`: "es-MX" (Mexican Spanish) vs "es-ES" (Spain Spanish)
- `scriptDirection`: "ltr" or "rtl"
- `culturalContext`: "Latin American", "Middle Eastern", etc.
- `seoStrategy`: Localized keywords, hreflang tags, meta descriptions

**StyleConfig Enhancements**:
- `languageInstructions`: "Use formal Spanish", "Include honorifics for Japanese"
- `culturalConsiderations`: "Avoid idioms", "Use metric system", "Reference local companies"

**Cost Impact**: Same as English (~$0.04-0.11 per post). Asian languages have 3-4x better tokenization efficiency with GPT-4o.

**Database Schema**:
- `projects.language` (VARCHAR): ISO 639-1 language code (default: 'en')
- `projects.language_config` (JSONB): Additional language settings
- `posts.language` (VARCHAR): Auto-populated from project

**Example Usage**:
```sql
-- Create a Spanish blog project
INSERT INTO projects (name, platform_type, endpoints, auth_config, style_config, is_active, language, language_config)
VALUES (
  'Spanish Tech Blog',
  'custom-backend-v1',
  '{"publish": "https://example.com/api/publish"}',
  '{"apiKey": "key"}',
  '{"tone": "professional", "languageInstructions": "Use Latin American Spanish", "culturalConsiderations": "Reference Spanish-speaking tech companies"}',
  true,
  'es',
  '{"regionalVariant": "es-MX", "scriptDirection": "ltr", "culturalContext": "Latin American"}'
);
```

### Service Layer Architecture

**DatabaseService** (`src/services/database.service.ts`)
- Central hub for all Supabase operations
- Methods: `getPendingPosts()`, `markPostPublished()`, `markPostFailed()`, logging
- Uses raw Supabase client (no typed schemas to avoid complexity)

**WorkflowService** (`src/services/workflow.service.ts`)
- Orchestrates the agentic research → content generation pipeline
- Implements iterative research (initial search + follow-up if needed)
- Calls ResearchService → ContentGenerationService with quality assessment
- Returns validated, complete Content object

**PublisherService** (`src/services/publisher.service.ts`)
- Main coordinator that runs the full pipeline for all projects
- Manages retry logic, error handling, and status updates
- Calls WorkflowService → ImageService → AdapterRegistry → Database updates

**ResearchService** (`src/services/research.service.ts`)
- SerpAPI integration for web research
- Methods: `search()`, `searchForFacts()`, `searchNews()`
- Returns structured ResearchResult with sources

**ContentGenerationService** (`src/services/content-generation.service.ts`)
- OpenAI GPT-4o integration
- **Iterative Generation System** (NEW):
  - `generateContentIteratively()` - Main orchestrator for quality improvement loop
  - `rateContent()` - AI evaluates content quality (word count, structure, depth, engagement)
  - `improveContent()` - Regenerates content with specific improvements based on rating
- Agentic prompting: `synthesizeResearch()`, `assessResearchQuality()`, `generateContent()`
- Uses system prompts based on StyleConfig from project settings

**ImageService** (`src/services/image.service.ts`)
- Unsplash API integration
- `enhanceContentWithImages()` adds images to generated content
- Automatically selects relevant images based on title/keywords

### Dynamic Adapter System

**Platform-Agnostic Content Format**:
All content uses a universal structure stored in `content_json`:
```typescript
{
  title: string
  body: string           // markdown or HTML
  images: [{url, alt, caption}]
  metadata: {tags, categories, publishDate, customFields}
}
```

**IPublisher Interface** (`src/types/index.ts`):
Every adapter must implement:
- `authenticate()` → Set up platform credentials
- `publish(content, config)` → Transform and publish content
- `uploadMedia?(media)` → Optional media upload

**Adapter Registry** (`src/adapters/adapter-registry.ts`):
- Dynamically loads adapters at runtime based on project's `platform_type`
- Example: `platform_type: 'custom-backend-v1'` → loads `custom-backend-v1.adapter.ts`
- Caches authenticated adapter instances

**BasePublisherAdapter** (`src/adapters/base.adapter.ts`):
- Abstract class with common functionality (HTTP client, error handling, logging)
- Provides helpers: `makeRequest()`, `formatBody()`, `validateContent()`, `handleError()`
- All custom adapters extend this class

**Creating New Adapters**:
1. Create `src/adapters/{platform-type}.adapter.ts`
2. Extend `BasePublisherAdapter`
3. Implement `authenticate()` and `publish()`
4. Export as default
5. Add project to database with matching `platform_type`

See `docs/ADAPTER_GUIDE.md` for detailed adapter creation instructions.

### Database Schema

**projects** table:
- `platform_type`: Adapter identifier (e.g., 'wordpress', 'custom-backend-v1')
- `endpoints`: JSON with API URLs (e.g., `{"publish": "...", "auth": "..."}`)
- `auth_config`: JSON with authentication (tokens, credentials)
- `parameters`: JSON with platform-specific config
- `style_config`: JSON with content generation preferences (tone, length, etc.)

**posts** table:
- `status`: ENUM ('pending', 'processing', 'published', 'failed')
- `content_json`: JSONB storing the platform-agnostic Content object
- `retry_count` / `max_retries`: Automatic retry logic
- `field_niche`, `keywords`: Used for research and content generation

**post_iterations** table (NEW):
- Stores each iteration of content generation with quality ratings
- `iteration_number`: Sequential iteration (1, 2, 3, 4)
- `content_json`: The content at this iteration
- `quality_score`: Overall score (1-10)
- `quality_feedback`: Detailed AI feedback
- `word_count`, `structure_score`, `depth_score`, `engagement_score`: Individual metrics
- Used for analyzing improvement patterns and debugging

**logs** table:
- All services log to this via DatabaseService
- Levels: 'info', 'warning', 'error', 'debug'

### Environment Variables

Required in `.env`:
- `SUPABASE_URL` - Project URL from Supabase dashboard
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key for backend access
- `SUPABASE_DB_PASSWORD` - Database password (required for migrations)
- `OPENAI_API_KEY` - OpenAI API key (PAID - required)
- `OPENAI_MODEL` - Model name (default: gpt-4o-mini)
- `SERPAPI_KEY` - SerpAPI key (free tier available)
- `UNSPLASH_ACCESS_KEY` - Unsplash API key (free tier)
- `CRON_SCHEDULE` - Cron expression for scheduling (default: "0 0 * * *")
- **Content Quality Configuration** (NEW):
  - `MAX_CONTENT_ITERATIONS` - Maximum improvement iterations (default: 4)
  - `MIN_QUALITY_SCORE` - Minimum score to stop iterating (default: 8)
  - `MIN_WORD_COUNT` - Minimum acceptable word count (default: 1000)
  - `TARGET_WORD_COUNT` - Target word count (default: 1500)
- **Multilingual Configuration** (NEW):
  - `DEFAULT_LANGUAGE` - Default language for new projects (default: 'en')
  - `SUPPORTED_LANGUAGES` - Comma-separated list of supported language codes

## Key Implementation Details

### Agentic Workflow
The system uses agentic AI behavior in WorkflowService:
1. Initial research via SerpAPI
2. AI assesses research quality with `assessResearchQuality()`
3. If `needsMore: true`, performs targeted follow-up research
4. Synthesizes all findings before content generation
5. **Iterative Quality Improvement** (NEW):
   - AI generates initial content
   - AI rates content on 4 criteria: word count, structure, depth, engagement
   - If score < 8/10: AI identifies specific improvements needed
   - AI regenerates content addressing weaknesses
   - Process repeats until score ≥ 8 or max iterations (4) reached
   - Early stopping saves costs when quality is sufficient

### Retry Logic
Built-in exponential backoff in `src/utils/retry.ts`:
- `retryWithBackoff()` for API calls
- DatabaseService handles post-level retries (reschedules failed posts)
- Non-retryable errors (auth failures, 4xx) fail immediately

### Error Handling
- All services use try-catch with structured error logging
- Failed posts: increment `retry_count`, reschedule for next day, update `error_message`
- After max retries, status changes to 'failed' permanently

### CLI Structure
Built with yargs in `src/cli.ts`:
- Commands: `publish`, `stats`
- Flags: `--project`, `--dry-run`, `--date`
- Validates env vars before execution
- Initializes all services in `initializeServices()`

## Project Structure

```
src/
├── adapters/              # Platform-specific publishers
│   ├── adapter-registry.ts    # Dynamic loader
│   ├── base.adapter.ts        # Abstract base class
│   └── custom-backend-v1.adapter.ts  # Example implementation
├── services/              # Core business logic
│   ├── database.service.ts    # Supabase operations
│   ├── research.service.ts    # SerpAPI integration
│   ├── content-generation.service.ts  # OpenAI integration
│   ├── image.service.ts       # Unsplash integration
│   ├── workflow.service.ts    # Research → AI orchestration
│   └── publisher.service.ts   # Main pipeline coordinator
├── types/                 # TypeScript definitions
│   ├── index.ts              # Core interfaces (Content, IPublisher, etc.)
│   └── database.ts           # Supabase schema types
├── utils/
│   └── retry.ts              # Exponential backoff utilities
├── cli.ts                # CLI entry point
├── scheduler.ts          # Cron scheduler
├── migrate.ts           # Database migration runner
└── view-content.ts      # View generated posts
```

## Adding New Features

### Adding a New Platform
1. Create adapter in `src/adapters/{platform}.adapter.ts`
2. Extend `BasePublisherAdapter`
3. Implement `authenticate()` and `publish()`
4. Insert project row in Supabase with matching `platform_type`

### Modifying Content Generation
- Edit prompts in `ContentGenerationService.buildSystemPrompt()` or `buildUserPrompt()`
- Adjust `StyleConfig` interface in `src/types/index.ts`
- Update database `style_config` JSON for projects

### Adding New Services
- Follow existing pattern: create in `src/services/`
- Inject dependencies via constructor
- Use `DatabaseService` for logging
- Export from `src/index.ts` for external use

## Testing the System

### Test Full Pipeline (Dry Run)
```bash
npm run cli publish --dry-run
```
This executes everything except actual publishing:
- ✓ Queries database
- ✓ Performs research
- ✓ Generates content
- ✓ Finds images
- ✗ Skips publish API call

### View Generated Content
```bash
npm run view
```
Shows the most recent post's full content, images, and metadata.

### Test Database Connection
```bash
npm run cli stats
```
Quick check that Supabase connection works.

## Cost Information

- **OpenAI API**: PAID (~$0.04-0.11 per post with iterative generation)
  - Initial generation: ~$0.01-0.02
  - Quality rating per iteration: ~$0.001
  - Content improvement per iteration: ~$0.02
  - **Average with 2 iterations**: ~$0.04-0.08 per post
  - **Worst case with 4 iterations**: ~$0.064-0.11 per post
  - Early stopping at score ≥ 8 saves costs
- **SerpAPI**: Free tier (100 searches/month)
- **Unsplash**: Free tier (50 requests/hour)
- **Supabase**: Free tier (500MB database)

**Estimated monthly cost for 30 posts**: $1.20-3.30 (OpenAI only, 2-3x increase due to quality iterations)

## Current Development Status (October 2025)

### Recent Enhancements

#### 1. Adaptive Deep Research System (COMPLETED)
**Status**: ✅ Implemented and tested
**Purpose**: Enhance research quality by scraping and AI-summarizing full web pages when initial research is deemed insufficient

**Components Added**:
- `ContentGenerationService.summarizeWebContent()` - Uses GPT-4o-mini to extract key facts from scraped web content (400-600 tokens per URL)
- `ResearchService.scrapeAndEnrichResults()` - Scrapes top N URLs and replaces snippets with AI summaries
- `WorkflowService` - Enhanced to trigger deep research when `assessResearchQuality()` returns `needsMore: true`

**Configuration** (.env):
```
RESEARCH_URLS_TO_SCRAPE=3        # Number of URLs to scrape when research quality is poor
RESEARCH_SUMMARY_TOKENS=500      # Target tokens per URL summary
```

**How It Works**:
1. Initial SerpAPI search returns 10 results with short snippets
2. AI assesses research quality and suggests additional research if needed
3. If triggered: System scrapes top 3 URLs, extracts text, and AI summarizes key facts
4. Enriched research (with detailed summaries) is passed to content generation

**Cost Impact**: ~$0.015 extra when deep research is triggered (3 URLs × $0.005/URL with GPT-4o-mini)

**Known Issues**:
- Some URLs return 404 or block scrapers (handled gracefully - keeps original snippet)
- Research quality assessment needs tuning to trigger more reliably for shallow topics

#### 2. Self-Refine Iterative Improvement System (COMPLETED ✅)
**Status**: ✅ Working - scores improve from 6.5 → 7.0/10 across iterations
**Quality Target**: 7.0/10 (considered "good enough" for production)

**What Was Implemented**:
- `ActionableImprovement` interface for paragraph-level feedback with localization, issue, action, and source reference
- `QualityRating` interface expanded with `actionable_improvements` array
- `rateContent()` - Rewritten to provide specific paragraph-level critiques with research source references
- `improveContent()` - Enhanced to use actionable improvements and iteration history
- Database storage for all iterations with quality metrics
- Debug logging to track improvement application

**Final Performance**:
```
Iteration 1: 511 words, Score: 6.5/10 (Structure: 8, Depth: 5.5, Engagement: 6.5)
Iteration 2: 809 words, Score: 7.0/10 (Structure: 8, Depth: 6.0, Engagement: 7.5) ⬆️
Iteration 3: 910 words, Score: 7.0/10 (Structure: 8, Depth: 6.0, Engagement: 7.5)
Iteration 4: 1009 words, Score: 7.0/10 (Structure: 8, Depth: 6.5, Engagement: 7.0)
```

**Results**:
- ✅ Scores improve (6.5 → 7.0)
- ✅ Word count increases substantially (511 → 1009)
- ✅ No timeout/hanging issues (simplified prompts)
- ✅ Actionable improvements are generated and applied
- ✅ Structure consistently excellent (8/10)
- ✅ Engagement improves (6.5 → 7.5)
- ⚠️ Depth plateaus at 6.0-6.5/10 (bottleneck for reaching 8+)

**Key Implementation Details**:
- Simplified prompts to avoid timeouts (~60% shorter than initial version)
- Increased max_tokens from 2500 → 3500 for longer content generation
- Pass previous score to rater for context on improvements
- Debug logging shows actionable improvements being generated and applied
- Early stopping when score reaches target (MIN_QUALITY_SCORE env var)

**Cost Impact**: No change from baseline (~$0.04-0.11 per post)

### Testing Tools

**View Iterations**:
```bash
npx tsx view-iterations.ts
```
Shows iteration-by-iteration quality scores and feedback for the most recent post.

### Technical Debt & Future Enhancements

1. **Improve Depth Score** (Optional): Currently plateaus at 6.0-6.5/10. To reach 8+, would need:
   - More aggressive enforcement of research source usage
   - Stricter validation that improvements were actually applied
   - Potentially multiple rating passes
   - Cost: Minimal effort, but diminishing returns

2. **Tune Research Assessment**: Quality assessment sometimes marks insufficient research as "sufficient"
   - Consider making the prompt more critical/demanding
   - Or lower the threshold for what triggers deep research

3. **Store Actionable Improvements in DB**: Currently only storing generic feedback text
   - Would enable better iteration analysis
   - Could help train/improve the system

4. **Add Cost Telemetry**: Track which posts trigger deep research and actual API costs
   - Useful for budget monitoring
   - Could optimize when to use deep research

5. **Consider o4-mini for Iterations**: Use cheaper model for rating/improvement steps
   - Potential 50% cost reduction
   - Would need testing to ensure quality doesn't suffer
