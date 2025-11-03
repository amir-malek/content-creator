#!/usr/bin/env node
// Scheduler - Runs the publishing pipeline on a schedule using node-cron

import cron from 'node-cron';
import dotenv from 'dotenv';
import { DatabaseService } from './services/database.service.js';
import { ResearchService } from './services/research.service.js';
import { ContentGenerationService } from './services/content-generation.service.js';
import { ImageService } from './services/image.service.js';
import { S3Service } from './services/s3.service.js';
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

  // S3 (for image storage)
  const s3Service = new S3Service(db);

  // Images
  const imageService = new ImageService(process.env.UNSPLASH_ACCESS_KEY!, s3Service);

  // Publisher (main orchestrator)
  return new PublisherService(db, workflow, imageService);
}

/**
 * Run the publishing job
 */
async function runPublishingJob(): Promise<void> {
  console.log('\n⏰ Scheduled job triggered at:', new Date().toISOString());

  try {
    const publisher = initializeServices();
    await publisher.processAllPosts(undefined, false);
    console.log('✅ Scheduled job completed successfully\n');
  } catch (error) {
    console.error('❌ Scheduled job failed:', error);
  }
}

/**
 * Main scheduler entry point
 */
async function main() {
  try {
    // Validate environment
    validateEnv();

    // Get cron schedule from env or use default (daily at midnight)
    const schedule = process.env.CRON_SCHEDULE || '0 0 * * *';

    // Validate cron expression
    if (!cron.validate(schedule)) {
      throw new Error(`Invalid cron schedule: ${schedule}`);
    }

    console.log('🕐 Content Creator Scheduler Started');
    console.log(`   Schedule: ${schedule}`);
    console.log(`   Next run: ${getNextRunTime(schedule)}\n`);
    console.log('   Press Ctrl+C to stop\n');

    // Schedule the job
    const task = cron.schedule(schedule, runPublishingJob, {
      scheduled: true,
      timezone: process.env.TIMEZONE || 'UTC',
    });

    // Run immediately on startup if IMMEDIATE_RUN is true
    if (process.env.IMMEDIATE_RUN === 'true') {
      console.log('🚀 Running immediately on startup...\n');
      await runPublishingJob();
    }

    // Keep process alive
    process.on('SIGINT', () => {
      console.log('\n\n⏹️  Stopping scheduler...');
      task.stop();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      console.log('\n\n⏹️  Stopping scheduler...');
      task.stop();
      process.exit(0);
    });
  } catch (error) {
    console.error('\n❌ Scheduler initialization failed:', error);
    process.exit(1);
  }
}

/**
 * Get next run time from cron schedule (approximate)
 */
function getNextRunTime(schedule: string): string {
  // Parse cron schedule and estimate next run
  // This is a simplified version - for production, use a cron parser library
  const parts = schedule.split(' ');
  const minute = parts[0];
  const hour = parts[1];

  if (minute === '0' && hour === '0') {
    return 'Daily at midnight';
  }

  if (minute === '*' && hour === '*') {
    return 'Every minute';
  }

  return schedule;
}

// Start scheduler
main();
