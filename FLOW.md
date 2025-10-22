### Daily Blog Publishing Script

This script, written in TypeScript and designed to run daily (e.g., via node-cron for scheduling or as a Supabase Edge Function with pg_cron), acts as a multi-project content automation worker. It leverages Supabase for database management, OpenAI for AI-driven research synthesis and content generation, and additional suggested APIs for search, images, and publishing. The flow is modular, configurable per project (stored in the database), and uses a dynamic adapter pattern to support publishing to ANY platform with an API. Authentication is handled securely via environment variables or Supabase's secret management.

#### Suggested Platforms and APIs
- **Database**: Supabase (Postgres-based, with JS client for TypeScript integration). It stores post queues (titles, publish dates, project IDs, status), project configs (platform type, API endpoints, auth tokens, custom parameters), and logs. Use Supabase's auth for secure access.
- **AI/Content Generation**: OpenAI API (e.g., GPT-4o for high-quality synthesis). This is the ONLY paid API in our stack. It handles agentic processes like deciding on research needs and generating/formatting the post.
- **Web Search/Research**: SerpAPI (free tier available, reliable real-time web/search results in TypeScript apps with easy Node.js SDK). This is our primary research tool.
- **Image Search/Linking**: Unsplash API (free tier, high-quality royalty-free image URLs; simple API with TypeScript support, no hosting needed—just link URLs).
- **Publishing Platforms/APIs**: Dynamic adapter-based system supporting ANY platform with an API. Each project in the database specifies:
  - `platform_type`: Identifier for which adapter to use (e.g., 'custom-backend-v1', 'wordpress', etc.)
  - `endpoints`: JSON object with API endpoint URLs
  - `auth_config`: JSON object with tokens and authentication details
  - `parameters`: JSON object with platform-specific parameters (headers, default fields, etc.)
  Adapters are loaded dynamically at runtime based on the platform_type.
- **Scheduling**: node-cron (lightweight TypeScript library for daily runs, e.g., at midnight). If deploying as a Supabase Edge Function, use pg_cron extension for database-triggered scheduling.
- **Notifications**: Existing Telegram notification system (can be integrated later for draft approval workflows if needed).
- **CLI Interface**: yargs or Commander.js (popular TypeScript CLI libraries) for commands like `--project=companyA` or `--dry-run`.
- **Other Utilities**: Axios or Fetch for API calls; dotenv for env vars; Supabase JS client for DB interactions.

#### Adapter Architecture
The publishing system uses a simple, dynamic adapter pattern to support any platform with an API:

**Platform-Agnostic Content Format**:
All generated content is stored in a standardized JSON structure:
```typescript
{
  title: string
  body: string           // markdown or html
  images: Array<{
    url: string
    alt: string
    caption?: string
  }>
  metadata: {
    tags: string[]
    categories?: string[]
    publishDate: Date
    customFields?: Record<string, any>
  }
}
```

**IPublisher Interface**:
Each platform adapter implements a simple contract:
```typescript
interface IPublisher {
  authenticate(): Promise<void>
  publish(content: Content, config: ProjectConfig): Promise<PublishResult>
  uploadMedia?(media: MediaFile): Promise<string>
}
```

**Dynamic Adapter Loading**:
- Adapters are stored in `/src/adapters/` directory
- Each adapter is a TypeScript class implementing `IPublisher`
- At runtime, the system loads the appropriate adapter based on `platform_type` from the project config
- Example: If `platform_type = 'custom-backend-v1'`, load `/src/adapters/custom-backend-v1.adapter.ts`

**Project Configuration in Database**:
Each project row contains:
- `platform_type`: String identifier (e.g., 'wordpress', 'custom-api', 'ghost')
- `endpoints`: JSON with API URLs (e.g., `{"publish": "https://api.example.com/posts", "media": "https://api.example.com/upload"}`)
- `auth_config`: JSON with authentication details (e.g., `{"token": "abc123", "tokenExpiry": "2025-12-31T23:59:59Z"}`)
- `parameters`: JSON with platform-specific params (e.g., `{"headers": {"X-Custom": "value"}, "defaultCategory": "blog"}`)

**Adding New Platforms**:
To support a new platform, simply create a new adapter class in `/src/adapters/` that implements `IPublisher`. The adapter receives the full project config and handles all platform-specific logic internally.

#### Step-by-Step Flow of the Script
The script executes daily (automatically via cron) or on-demand via CLI. It processes all due posts sequentially (one at a time for simplicity). Here's the flow:

1. **Initialization and CLI Handling**:
   - Parse CLI arguments (e.g., `node script.ts --project=all --mode=publish` to filter by project or simulate without publishing).
   - Load environment variables (e.g., API keys for OpenAI, SerpAPI, Unsplash).
   - Connect to Supabase database using the Supabase JS client (authenticate via service role key for backend access).

2. **Query Pending Posts from Database**:
   - Fetch posts ready for today or overdue: Query Supabase for rows where `publish_date <= current_date` and `status = 'pending'`, filtered by project if specified via CLI.
   - For each post, retrieve metadata: title, field/niche, keywords, target platform, and project config (including auth details).
   - Process posts sequentially (one at a time) for simplicity.

3. **Perform Research for Content**:
   - Use SerpAPI (free tier) to search for up-to-date info (e.g., query: "latest [title] in [field] 2025" with num_results=5-10 for snippets/sources).
   - Feed results into OpenAI (via agentic prompt): Let GPT-4o analyze/summarize research, identify key insights, and prepare structured data (e.g., facts, stats, trends) for the post. This ensures content is grounded in real, current data without hallucinations.

4. **Generate the Blog Post Content**:
   - Prompt OpenAI with the title, researched data, niche specifics, and style guidelines (from project config).
   - Generate a full draft: Include sections like intro, body with insights, conclusion, and proper formatting (headings, lists).
   - Make it agentic: If more depth is needed (e.g., based on initial output quality assessment), loop back for additional SerpAPI research calls.

5. **Find and Link Relevant Images**:
   - Query Unsplash API (free tier) with topic-derived terms (e.g., "high-quality images for [title] in [field]").
   - Select 1-3 relevant URLs (filter by relevance score or tags; include alt text like "Illustration of [topic] for blog").
   - Embed as links in the content (e.g., `<img src="unsplash-url" alt="description">` for HTML). No hosting needed - just use direct URLs.

6. **Format the Content into Platform-Agnostic Structure**:
   - Create a standardized content object with: title, body (markdown or HTML), images array, and metadata
   - Add metadata: tags (from keywords), categories (from project config), publish date, and any custom fields
   - Ensure proper structure: Headings, image references, citations from research
   - This universal format will be transformed by the specific adapter during publishing

7. **Publish the Post via Dynamic Adapter**:
   - Load the appropriate adapter based on `platform_type` from project config
   - Create platform-agnostic content object (title, body, images, metadata)
   - Call `adapter.authenticate()` using credentials from `auth_config`
   - Call `adapter.publish(content, projectConfig)` which handles:
     - Transforming the platform-agnostic content to platform-specific format
     - Making API calls to the endpoints specified in `endpoints` config
     - Applying any custom parameters from `parameters` config (headers, default fields, etc.)
   - The adapter returns a `PublishResult` with status and published post URL
   - On success: Update DB status to 'published' and store the published post URL
   - On failure: See error handling below (reschedule logic)

8. **Error Handling, Logging, and Cleanup**:
   - **Retry Logic**: For transient failures (network issues, rate limits), retry up to 3 times with exponential backoff.
   - **Rescheduling**: If a post fails after all retries:
     - Increment a `retry_count` field in the database
     - Update `publish_date` to the next day (or add delay based on retry count)
     - Keep status as 'pending' so it will be picked up in the next run
     - Log the failure reason to a logs table
   - **Notifications**: Log all activity to Supabase logs table. Optionally use existing Telegram notification system for critical failures.
   - **Cleanup**: If no posts are due, exit gracefully. Disconnect from Supabase at end of run.

#### Notes on MVP Scope
- **No duplicate checking**: User manages their own titles and knows what they've published. Keep it simple.
- **No SEO tracking/analytics**: Out of scope for MVP. Focus is on content generation and publishing.
- **Sequential processing**: Process one post at a time for code simplicity. Can optimize to parallel later if needed.
- **Cost-conscious**: Only OpenAI API is paid. SerpAPI and Unsplash both have generous free tiers.