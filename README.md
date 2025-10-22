# Content Creator - Automated Blog Publishing System

A TypeScript-based content automation system that generates, researches, and publishes blog posts to any platform with an API. Features AI-powered content generation, web research synthesis, and a dynamic adapter pattern for multi-platform publishing.

## Features

- 🤖 **AI-Powered Content Generation**: Uses OpenAI GPT-4o for high-quality, research-backed blog posts
- 🔍 **Intelligent Research**: Agentic workflow with SerpAPI for up-to-date web research
- 🖼️ **Automatic Image Selection**: Integrates Unsplash for relevant, high-quality images
- 🔌 **Platform-Agnostic Publishing**: Dynamic adapter system supports ANY platform with an API
- 📊 **Multi-Project Management**: Handle multiple blogs/platforms from a single system
- ⏰ **Automated Scheduling**: Built-in cron scheduler for daily publishing
- 🔄 **Retry Logic**: Exponential backoff for handling transient failures
- 📝 **Comprehensive Logging**: Track all operations in Supabase database

## Architecture

### Core Components

1. **Research Service** - SerpAPI integration for web research
2. **Content Generation Service** - OpenAI integration with agentic prompting
3. **Image Service** - Unsplash integration for image search
4. **Workflow Service** - Orchestrates research → synthesis → generation
5. **Publisher Service** - Main pipeline coordinator
6. **Database Service** - Supabase client for data management
7. **Adapter Registry** - Dynamic platform adapter loading

### Adapter System

The system uses a **dynamic adapter pattern** to support any publishing platform:

```typescript
// Each adapter implements IPublisher interface
interface IPublisher {
  authenticate(): Promise<void>;
  publish(content: Content, config: ProjectConfig): Promise<PublishResult>;
  uploadMedia?(media: MediaFile): Promise<string>;
}
```

**Platform-Agnostic Content Format**:
```typescript
{
  title: string
  body: string           // markdown or HTML
  images: Array<{url, alt, caption}>
  metadata: {tags, categories, publishDate, customFields}
}
```

Adapters transform this universal format to platform-specific formats.

## Prerequisites

- Node.js 18+ and npm
- Supabase account (free tier sufficient)
- OpenAI API key (paid - required for content generation)
- SerpAPI key (free tier available)
- Unsplash API key (free tier available)

## Installation

### 1. Clone and Install Dependencies

```bash
git clone <repository-url>
cd content-creator
npm install
```

### 2. Set Up Environment Variables

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# OpenAI (PAID - Required)
OPENAI_API_KEY=your-openai-api-key
OPENAI_MODEL=gpt-4o

# SerpAPI (Free tier available)
SERPAPI_KEY=your-serpapi-key

# Unsplash (Free tier available)
UNSPLASH_ACCESS_KEY=your-unsplash-access-key

# Scheduler
CRON_SCHEDULE="0 0 * * *"  # Daily at midnight
```

### 3. Set Up Database

Run the migrations in your Supabase project:

1. Go to **SQL Editor** in Supabase dashboard
2. Run each migration file in order:
   - `migrations/001_create_projects_table.sql`
   - `migrations/002_create_posts_table.sql`
   - `migrations/003_create_logs_table.sql`

See `migrations/README.md` for details.

### 4. Build the Project

```bash
npm run build
```

## Usage

### CLI Commands

#### Publish Posts

Process and publish all pending posts:

```bash
npm run cli publish
```

Process posts for a specific project:

```bash
npm run cli publish --project "Tech Blog"
```

Dry run (generate content but don't publish):

```bash
npm run cli publish --dry-run
```

#### View Statistics

```bash
npm run cli stats
```

### Automated Scheduling

Start the scheduler to run daily:

```bash
npm run schedule
```

Or run the built version:

```bash
node dist/scheduler.js
```

The scheduler will run based on the `CRON_SCHEDULE` in your `.env` file.

**Cron Schedule Examples**:
- `0 0 * * *` - Daily at midnight
- `0 9 * * *` - Daily at 9 AM
- `0 */6 * * *` - Every 6 hours
- `0 0 * * 1` - Weekly on Mondays

### Programmatic Usage

```typescript
import {
  DatabaseService,
  ResearchService,
  ContentGenerationService,
  ImageService,
  WorkflowService,
  PublisherService,
} from './src/index.js';

// Initialize services
const db = new DatabaseService(supabaseUrl, supabaseKey);
const research = new ResearchService(serpApiKey);
const contentGen = new ContentGenerationService(openAiKey);
const workflow = new WorkflowService(research, contentGen);
const imageService = new ImageService(unsplashKey);
const publisher = new PublisherService(db, workflow, imageService);

// Process all posts
await publisher.processAllPosts();
```

## Adding Projects and Posts

### 1. Add a Project

Insert a project record in Supabase:

```sql
INSERT INTO projects (name, platform_type, endpoints, auth_config, parameters, style_config)
VALUES (
  'My Tech Blog',
  'custom-backend-v1',
  '{"publish": "https://api.example.com/posts", "media": "https://api.example.com/upload"}',
  '{"token": "your-api-token", "tokenExpiry": "2025-12-31T23:59:59Z"}',
  '{"headers": {"X-Custom": "value"}, "defaultCategory": "blog"}',
  '{"tone": "professional", "length": "medium", "includeImages": true}'
);
```

### 2. Add Posts

Insert post records for your project:

```sql
INSERT INTO posts (project_id, title, field_niche, keywords, publish_date)
VALUES (
  (SELECT id FROM projects WHERE name = 'My Tech Blog' LIMIT 1),
  'The Future of AI in Web Development',
  'Web Development',
  ARRAY['AI', 'machine learning', 'web development', 'automation'],
  '2025-10-24'
);
```

## Creating Custom Adapters

See `docs/ADAPTER_GUIDE.md` for detailed instructions on creating platform-specific adapters.

**Quick Start**:

1. Create `src/adapters/your-platform.adapter.ts`
2. Extend `BasePublisherAdapter`
3. Implement `authenticate()` and `publish()` methods
4. Export as default

Example:

```typescript
import { BasePublisherAdapter } from './base.adapter.js';
import { Content, ProjectConfig, PublishResult } from '../types/index.js';

export default class YourPlatformAdapter extends BasePublisherAdapter {
  async authenticate(): Promise<void> {
    // Implement authentication
  }

  async publish(content: Content, config: ProjectConfig): Promise<PublishResult> {
    // Transform content to platform format
    // Make API call
    // Return result
  }
}
```

## Project Structure

```
content-creator/
├── src/
│   ├── adapters/           # Platform adapters
│   │   ├── adapter-registry.ts
│   │   ├── base.adapter.ts
│   │   └── custom-backend-v1.adapter.ts
│   ├── services/           # Core services
│   │   ├── database.service.ts
│   │   ├── research.service.ts
│   │   ├── content-generation.service.ts
│   │   ├── image.service.ts
│   │   ├── workflow.service.ts
│   │   └── publisher.service.ts
│   ├── types/              # TypeScript types
│   │   ├── index.ts
│   │   └── database.ts
│   ├── utils/              # Utilities
│   │   └── retry.ts
│   ├── cli.ts              # CLI interface
│   ├── scheduler.ts        # Cron scheduler
│   └── index.ts            # Main exports
├── migrations/             # Database migrations
├── config/                 # Configuration files
├── .env.example            # Environment template
├── package.json
├── tsconfig.json
└── README.md
```

## Cost Considerations

- **OpenAI API**: PAID - Approximately $0.01-0.05 per post (GPT-4o pricing)
- **SerpAPI**: Free tier (100 searches/month) - 1 search per post
- **Unsplash**: Free tier (50 requests/hour) - sufficient for most use cases
- **Supabase**: Free tier (500MB database, 2GB bandwidth) - sufficient for thousands of posts

**Estimated monthly cost for 30 posts**: ~$0.30-1.50 (OpenAI only)

## Development

### Build

```bash
npm run build
```

### Watch Mode

```bash
npm run dev
```

### Run TypeScript Directly

```bash
npx tsx src/cli.ts publish --dry-run
```

## Troubleshooting

### Posts Not Publishing

1. Check post status: `SELECT * FROM posts WHERE status = 'failed'`
2. Check logs: `SELECT * FROM logs WHERE level = 'error' ORDER BY created_at DESC LIMIT 10`
3. Verify API credentials in `.env`
4. Test adapter authentication manually

### Research Failures

- Verify SerpAPI key is valid and has remaining quota
- Check `logs` table for specific error messages
- Try reducing `numResults` in research calls

### Content Quality Issues

- Adjust `styleConfig` in project settings
- Add more specific keywords to posts
- Increase `maxResearchIterations` in workflow service
- Try different OpenAI model (GPT-4o recommended)

## License

MIT

## Support

For issues and feature requests, please open an issue on GitHub.
