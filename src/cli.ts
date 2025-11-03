#!/usr/bin/env node
// CLI interface for the content creator

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import dotenv from 'dotenv';
import { DatabaseService } from './services/database.service.js';
import { ResearchService } from './services/research.service.js';
import { ContentGenerationService } from './services/content-generation.service.js';
import { ImageService } from './services/image.service.js';
import { OpenAIImageService } from './services/openai-image.service.js';
import { S3Service } from './services/s3.service.js';
import { WorkflowService } from './services/workflow.service.js';
import { PublisherService } from './services/publisher.service.js';
import {
  promptProjectName,
  promptPlatformType,
  promptEndpoints,
  promptAuthConfig,
  promptParameters,
  promptStyleConfig,
  promptLanguage,
  promptLanguageConfig,
  promptPostTitle,
  promptFieldNiche,
  promptKeywords,
  promptPublishDate,
  promptConfirm,
  promptSelect,
  promptEnableS3,
  promptS3Config,
} from './utils/prompt-helpers.js';

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

  // OpenAI Image Generation (DALL-E)
  // Optional - only used when project imageSource is 'openai' or 'hybrid'
  const openaiImageService = new OpenAIImageService(
    process.env.OPENAI_API_KEY!,
    s3Service,
    db,
    'gpt-4o-mini' // Model for prompt enhancement
  );

  // Images
  const imageService = new ImageService(
    process.env.UNSPLASH_ACCESS_KEY!,
    s3Service,
    openaiImageService // Pass OpenAI service for DALL-E support
  );

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
      .command('project:add', 'Create a new project (interactive)')
      .command('project:list', 'List all projects')
      .command('project:edit', 'Edit an existing project (interactive)')
      .command('project:delete', 'Delete a project (interactive)')
      .command('post:add', 'Create a new post (interactive)')
      .command('post:list', 'List all posts')
      .command('post:delete', 'Delete a post (interactive)')
      .demandCommand(1, 'You must specify a command')
      .help()
      .alias('help', 'h')
      .version()
      .alias('version', 'v')
      .parse();

    const command = argv._[0] as string;

    // Initialize database service (required for all commands)
    const db = new DatabaseService(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Execute command
    switch (command) {
      case 'publish':
        {
          const publisher = initializeServices();
          await handlePublish(publisher, argv);
        }
        break;

      case 'stats':
        {
          const publisher = initializeServices();
          await handleStats(publisher, argv);
        }
        break;

      case 'project:add':
        await handleProjectAdd(db);
        break;

      case 'project:list':
        await handleProjectList(db);
        break;

      case 'project:edit':
        await handleProjectEdit(db);
        break;

      case 'project:delete':
        await handleProjectDelete(db);
        break;

      case 'post:add':
        await handlePostAdd(db);
        break;

      case 'post:list':
        await handlePostList(db);
        break;

      case 'post:delete':
        await handlePostDelete(db);
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

// ====================
// PROJECT COMMANDS
// ====================

/**
 * Handle project:add command
 */
async function handleProjectAdd(db: DatabaseService): Promise<void> {
  try {
    console.log('\n✨ Create New Project\n');

    const name = await promptProjectName();
    const platform_type = await promptPlatformType();
    const endpoints = await promptEndpoints();
    const auth_config = await promptAuthConfig();
    const parameters = await promptParameters();
    const style_config = await promptStyleConfig();
    const language = await promptLanguage();
    const language_config = await promptLanguageConfig(language);

    // S3 configuration
    const use_s3_for_images = await promptEnableS3(false);
    let s3_config = null;
    if (use_s3_for_images) {
      s3_config = await promptS3Config();
    }

    const project = await db.createProject({
      name,
      platform_type,
      endpoints,
      auth_config,
      parameters,
      style_config,
      language,
      language_config,
      use_s3_for_images,
      s3_config,
      is_active: true,
    });

    console.log(`\n✅ Project "${project.name}" created successfully!`);
    console.log(`   ID: ${project.id}`);
    console.log(`   Platform: ${project.platformType}`);
    console.log(`   Language: ${project.language}`);
    if (use_s3_for_images) {
      const configSource = s3_config ? 'project-specific' : 'global';
      console.log(`   S3 Upload: ✓ Enabled (${configSource} configuration)`);
    }
  } catch (error: any) {
    console.error(`\n❌ Failed to create project: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Handle project:list command
 */
async function handleProjectList(db: DatabaseService): Promise<void> {
  try {
    console.log('\n📋 All Projects\n');

    const projects = await db.getAllProjects();

    if (projects.length === 0) {
      console.log('   No projects found. Create one with: npm run cli project:add\n');
      return;
    }

    console.log(`Found ${projects.length} project(s):\n`);

    projects.forEach((project) => {
      const status = project.isActive ? '🟢 Active' : '🔴 Inactive';
      console.log(`   ${status} ${project.name}`);
      console.log(`      ID: ${project.id}`);
      console.log(`      Platform: ${project.platformType}`);
      console.log(`      Language: ${project.language}`);
      console.log(`      Endpoints: ${Object.keys(project.endpoints).join(', ')}`);
      console.log('');
    });
  } catch (error: any) {
    console.error(`\n❌ Failed to list projects: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Handle project:edit command
 */
async function handleProjectEdit(db: DatabaseService): Promise<void> {
  try {
    console.log('\n✏️  Edit Project\n');

    const projects = await db.getAllProjects();

    if (projects.length === 0) {
      console.log('   No projects found. Create one with: npm run cli project:add\n');
      return;
    }

    const selectedProject = await promptSelect(
      'Select project to edit:',
      projects.map((p) => ({
        value: p.id,
        name: `${p.name} (${p.platformType})`,
        description: p.isActive ? 'Active' : 'Inactive',
      }))
    );

    const project = projects.find((p) => p.id === selectedProject);
    if (!project) throw new Error('Project not found');

    const s3Status = project.useS3ForImages ? '✓ Enabled' : '✗ Disabled';
    const s3ConfigSource = project.s3Config ? 'project-specific' : 'global';

    const fieldToEdit = await promptSelect(
      'Select field to edit:',
      [
        { value: 'name', name: 'Name', description: `Current: ${project.name}` },
        { value: 'platform_type', name: 'Platform Type', description: `Current: ${project.platformType}` },
        { value: 'endpoints', name: 'Endpoints', description: 'Edit API endpoints' },
        { value: 'auth_config', name: 'Auth Config', description: 'Edit authentication' },
        { value: 'parameters', name: 'Parameters', description: 'Edit platform parameters' },
        { value: 'style_config', name: 'Style Config', description: 'Edit content style' },
        { value: 'language', name: 'Language', description: `Current: ${project.language}` },
        { value: 'language_config', name: 'Language Config', description: 'Edit language settings' },
        { value: 'use_s3_for_images', name: 'S3 Upload', description: `${s3Status}` },
        { value: 's3_config', name: 'S3 Configuration', description: `Using ${s3ConfigSource} config` },
        { value: 'is_active', name: 'Status', description: project.isActive ? 'Active' : 'Inactive' },
      ]
    );

    let newValue: any;

    switch (fieldToEdit) {
      case 'name':
        newValue = await promptProjectName(project.name);
        break;
      case 'platform_type':
        newValue = await promptPlatformType(project.platformType);
        break;
      case 'endpoints':
        newValue = await promptEndpoints(project.endpoints);
        break;
      case 'auth_config':
        newValue = await promptAuthConfig(project.authConfig);
        break;
      case 'parameters':
        newValue = await promptParameters(project.parameters);
        break;
      case 'style_config':
        newValue = await promptStyleConfig(project.styleConfig);
        break;
      case 'language':
        newValue = await promptLanguage(project.language);
        break;
      case 'language_config':
        newValue = await promptLanguageConfig(project.language || 'en', project.languageConfig);
        break;
      case 'use_s3_for_images':
        newValue = await promptEnableS3(project.useS3ForImages);
        break;
      case 's3_config':
        newValue = await promptS3Config();
        break;
      case 'is_active':
        newValue = await promptConfirm('Activate project?', project.isActive);
        break;
    }

    await db.updateProject(project.id, { [fieldToEdit]: newValue });

    console.log(`\n✅ Project "${project.name}" updated successfully!`);
  } catch (error: any) {
    console.error(`\n❌ Failed to edit project: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Handle project:delete command
 */
async function handleProjectDelete(db: DatabaseService): Promise<void> {
  try {
    console.log('\n🗑️  Delete Project\n');

    const projects = await db.getAllProjects();

    if (projects.length === 0) {
      console.log('   No projects found.\n');
      return;
    }

    const selectedProject = await promptSelect(
      'Select project to delete:',
      projects.map((p) => ({
        value: p.id,
        name: `${p.name} (${p.platformType})`,
        description: p.isActive ? 'Active' : 'Inactive',
      }))
    );

    const project = projects.find((p) => p.id === selectedProject);
    if (!project) throw new Error('Project not found');

    const deleteType = await promptSelect(
      'How do you want to delete this project?',
      [
        { value: 'soft', name: 'Deactivate', description: 'Keep data, mark as inactive' },
        { value: 'hard', name: 'Permanently Delete', description: 'Remove all data (cannot be undone)' },
      ]
    );

    const confirmed = await promptConfirm(
      `Are you sure you want to ${deleteType === 'soft' ? 'deactivate' : 'permanently delete'} "${project.name}"?`,
      false
    );

    if (!confirmed) {
      console.log('\n   Cancelled.\n');
      return;
    }

    if (deleteType === 'soft') {
      await db.deactivateProject(project.id);
      console.log(`\n✅ Project "${project.name}" has been deactivated.`);
    } else {
      await db.deleteProject(project.id);
      console.log(`\n✅ Project "${project.name}" has been permanently deleted.`);
    }
  } catch (error: any) {
    console.error(`\n❌ Failed to delete project: ${error.message}`);
    process.exit(1);
  }
}

// ====================
// POST COMMANDS
// ====================

/**
 * Handle post:add command
 */
async function handlePostAdd(db: DatabaseService): Promise<void> {
  try {
    console.log('\n✨ Create New Post\n');

    const projects = await db.getActiveProjects();

    if (projects.length === 0) {
      console.log('   No active projects found. Create one with: npm run cli project:add\n');
      return;
    }

    const selectedProject = await promptSelect(
      'Select project:',
      projects.map((p) => ({
        value: p.id,
        name: `${p.name} (${p.platformType})`,
        description: `Language: ${p.language}`,
      }))
    );

    const title = await promptPostTitle();
    const field_niche = await promptFieldNiche();
    const keywords = await promptKeywords();
    const publish_date = await promptPublishDate();

    const post = await db.createPost({
      project_id: selectedProject,
      title,
      field_niche,
      keywords,
      publish_date,
      status: 'pending',
    });

    console.log(`\n✅ Post "${post.title}" created successfully!`);
    console.log(`   ID: ${post.id}`);
    console.log(`   Publish Date: ${publish_date}`);
    console.log(`   Status: ${post.status}`);
  } catch (error: any) {
    console.error(`\n❌ Failed to create post: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Handle post:list command
 */
async function handlePostList(db: DatabaseService): Promise<void> {
  try {
    console.log('\n📋 All Posts\n');

    const filterByProject = await promptConfirm('Filter by project?', false);
    let projectId: string | undefined;

    if (filterByProject) {
      const projects = await db.getAllProjects();
      projectId = await promptSelect(
        'Select project:',
        projects.map((p) => ({
          value: p.id,
          name: `${p.name} (${p.platformType})`,
        }))
      );
    }

    const filterByStatus = await promptConfirm('Filter by status?', false);
    let status: 'pending' | 'processing' | 'published' | 'failed' | undefined;

    if (filterByStatus) {
      status = await promptSelect(
        'Select status:',
        [
          { value: 'pending' as const, name: 'Pending' },
          { value: 'processing' as const, name: 'Processing' },
          { value: 'published' as const, name: 'Published' },
          { value: 'failed' as const, name: 'Failed' },
        ]
      );
    }

    const posts = await db.getAllPosts({ projectId, status });

    if (posts.length === 0) {
      console.log('   No posts found.\n');
      return;
    }

    console.log(`Found ${posts.length} post(s):\n`);

    for (const post of posts) {
      const project = await db.getProjectById(post.projectId);
      const statusEmoji = {
        pending: '⏳',
        processing: '⚙️',
        published: '✅',
        failed: '❌',
      }[post.status];

      console.log(`   ${statusEmoji} ${post.title}`);
      console.log(`      ID: ${post.id}`);
      console.log(`      Project: ${project?.name || 'Unknown'}`);
      console.log(`      Status: ${post.status}`);
      console.log(`      Publish Date: ${post.publishDate.toISOString().split('T')[0]}`);
      if (post.retryCount > 0) {
        console.log(`      Retries: ${post.retryCount}/${post.maxRetries}`);
      }
      if (post.publishedUrl) {
        console.log(`      URL: ${post.publishedUrl}`);
      }
      console.log('');
    }
  } catch (error: any) {
    console.error(`\n❌ Failed to list posts: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Handle post:delete command
 */
async function handlePostDelete(db: DatabaseService): Promise<void> {
  try {
    console.log('\n🗑️  Delete Post\n');

    const posts = await db.getAllPosts();

    if (posts.length === 0) {
      console.log('   No posts found.\n');
      return;
    }

    const selectedPost = await promptSelect(
      'Select post to delete:',
      await Promise.all(
        posts.map(async (p) => {
          const project = await db.getProjectById(p.projectId);
          return {
            value: p.id,
            name: `${p.title}`,
            description: `${project?.name || 'Unknown'} - ${p.status}`,
          };
        })
      )
    );

    const post = posts.find((p) => p.id === selectedPost);
    if (!post) throw new Error('Post not found');

    const confirmed = await promptConfirm(
      `Are you sure you want to permanently delete "${post.title}"?`,
      false
    );

    if (!confirmed) {
      console.log('\n   Cancelled.\n');
      return;
    }

    await db.deletePost(post.id);
    console.log(`\n✅ Post "${post.title}" has been permanently deleted.`);
  } catch (error: any) {
    console.error(`\n❌ Failed to delete post: ${error.message}`);
    process.exit(1);
  }
}

// Run CLI
main();
