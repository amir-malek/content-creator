#!/usr/bin/env node
// CLI interface for the content creator

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import dotenv from 'dotenv';
import { DatabaseService } from './services/database.service.js';
import { ResearchService } from './services/research.service.js';
import { ContentGenerationService } from './services/content-generation.service.js';
import { ImageService } from './services/image.service.js';
import { WorkflowService } from './services/workflow.service.js';
import { PublisherService } from './services/publisher.service.js';

// Load environment variables
dotenv.config();

/**
 * Validate required environment variables
 */
function validateEnv(): void {
  const required = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'OPENAI_API_KEY',
    'SERPAPI_KEY',
    'UNSPLASH_ACCESS_KEY',
  ];

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    missing.forEach((key) => console.error(`   - ${key}`));
    console.error('\nPlease check your .env file');
    process.exit(1);
  }
}

/**
 * Initialize all services
 */
function initializeServices(): PublisherService {
  // Database
  const db = new DatabaseService(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Research
  const research = new ResearchService(process.env.SERPAPI_KEY!);

  // Content Generation
  const contentGen = new ContentGenerationService(
    process.env.OPENAI_API_KEY!,
    process.env.OPENAI_MODEL || 'gpt-4o'
  );

  // Workflow
  const workflow = new WorkflowService(research, contentGen);

  // Images
  const imageService = new ImageService(process.env.UNSPLASH_ACCESS_KEY!);

  // Publisher (main orchestrator)
  return new PublisherService(db, workflow, imageService);
}

/**
 * Main CLI entry point
 */
async function main() {
  try {
    // Validate environment
    validateEnv();

    // Parse CLI arguments
    const argv = await yargs(hideBin(process.argv))
      .scriptName('content-creator')
      .usage('$0 <command> [options]')
      .command('publish', 'Process and publish pending posts', (yargs) => {
        return yargs
          .option('project', {
            alias: 'p',
            type: 'string',
            description: 'Project name to process (or "all" for all projects)',
            default: 'all',
          })
          .option('dry-run', {
            alias: 'd',
            type: 'boolean',
            description: 'Generate content but do not publish',
            default: false,
          })
          .option('date', {
            type: 'string',
            description: 'Process posts for specific date (YYYY-MM-DD)',
          });
      })
      .command('stats', 'Show statistics', (yargs) => {
        return yargs.option('project', {
          alias: 'p',
          type: 'string',
          description: 'Project name to show stats for',
        });
      })
      .demandCommand(1, 'You must specify a command')
      .help()
      .alias('help', 'h')
      .version()
      .alias('version', 'v')
      .parse();

    const command = argv._[0] as string;

    // Initialize services
    const publisher = initializeServices();

    // Execute command
    switch (command) {
      case 'publish':
        await handlePublish(publisher, argv);
        break;

      case 'stats':
        await handleStats(publisher, argv);
        break;

      default:
        console.error(`Unknown command: ${command}`);
        process.exit(1);
    }

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  }
}

/**
 * Handle publish command
 */
async function handlePublish(publisher: PublisherService, argv: any): Promise<void> {
  const project = argv.project === 'all' ? undefined : argv.project;
  const dryRun = argv.dryRun || false;

  console.log('\n📝 Content Creator - Publish Command');
  console.log(`   Project: ${project || 'all'}`);
  console.log(`   Mode: ${dryRun ? 'DRY RUN' : 'PUBLISH'}`);

  if (dryRun) {
    console.log('   ⚠️  Dry run mode: Content will be generated but not published\n');
  }

  await publisher.processAllPosts(project, dryRun);
}

/**
 * Handle stats command
 */
async function handleStats(publisher: PublisherService, _argv: any): Promise<void> {
  console.log('\n📊 Content Creator - Statistics\n');

  // TODO: Implement project lookup if project name provided
  const stats = await publisher.getStatistics();

  console.log(`   Pending posts: ${stats.pendingCount}`);
  console.log(`   Published today: ${stats.publishedToday}`);
  console.log();
}

// Run CLI
main();
