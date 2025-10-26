// Publisher Service - Main orchestrator for the publishing pipeline

import { DatabaseService } from './database.service.js';
import { WorkflowService } from './workflow.service.js';
import { ImageService } from './image.service.js';
import { AdapterRegistry } from '../adapters/adapter-registry.js';
import { Post, ProjectConfig, Content } from '../types/index.js';

/**
 * Main publisher service that orchestrates the entire publishing pipeline
 * Handles: research → content generation → image enhancement → publishing
 */
export class PublisherService {
  private db: DatabaseService;
  private workflow: WorkflowService;
  private imageService: ImageService;

  constructor(db: DatabaseService, workflow: WorkflowService, imageService: ImageService) {
    this.db = db;
    this.workflow = workflow;
    this.imageService = imageService;
  }

  /**
   * Process all pending posts for all active projects
   * @param projectFilter Optional project name to filter by
   * @param dryRun If true, generate content but don't publish
   */
  async processAllPosts(projectFilter?: string, dryRun: boolean = false): Promise<void> {
    try {
      console.log('\n========================================');
      console.log('🚀 Starting Publishing Pipeline');
      console.log('========================================\n');

      // Get active projects
      const projects = await this.getActiveProjects(projectFilter);

      if (projects.length === 0) {
        console.log('⚠️  No active projects found');
        return;
      }

      console.log(`📋 Found ${projects.length} active project(s)\n`);

      // Process each project
      for (const project of projects) {
        await this.processProjectPosts(project, dryRun);
      }

      console.log('\n========================================');
      console.log('✅ Publishing Pipeline Complete');
      console.log('========================================\n');
    } catch (error) {
      console.error('\n❌ Publishing pipeline failed:', error);
      throw error;
    }
  }

  /**
   * Process all pending posts for a specific project
   */
  private async processProjectPosts(project: ProjectConfig, dryRun: boolean): Promise<void> {
    console.log(`\n📁 Project: ${project.name}`);
    console.log(`   Platform: ${project.platformType}`);

    try {
      // Get pending posts for this project
      const posts = await this.db.getPendingPosts(project.id);

      if (posts.length === 0) {
        console.log('   ℹ️  No pending posts');
        return;
      }

      console.log(`   📝 Processing ${posts.length} post(s)\n`);

      // Process each post sequentially
      for (const post of posts) {
        await this.processPost(post, project, dryRun);
      }
    } catch (error) {
      await this.db.logError(`Project processing failed: ${error}`, undefined, project.id);
      console.error(`   ❌ Failed to process project: ${error}`);
    }
  }

  /**
   * Process a single post through the entire pipeline
   */
  async processPost(post: Post, project: ProjectConfig, dryRun: boolean = false): Promise<void> {
    const startTime = Date.now();

    console.log(`\n   ╔════════════════════════════════════════`);
    console.log(`   ║ Post: ${post.title}`);
    console.log(`   ╚════════════════════════════════════════`);

    try {
      // Mark post as processing
      await this.db.markPostProcessing(post.id);
      await this.db.logInfo(`Starting processing: ${post.title}`, post.id, project.id);

      // Step 1: Generate content (includes research and iterative improvements)
      console.log('   → Generating content iteratively...');
      const { content, iterations } = await this.workflow.generatePostContent(
        post,
        project.styleConfig,
        project.language || 'en' // Pass project language for multilingual content generation
      );

      // Log iteration results
      const finalRating = iterations[iterations.length - 1]?.rating;
      console.log(
        `   ✓ Content generated with ${iterations.length} iteration(s) (Final score: ${finalRating?.score || 'N/A'}/10)`
      );

      // Validate content
      const validation = this.workflow.validateContent(content);
      if (!validation.valid) {
        throw new Error(`Content validation failed: ${validation.issues.join(', ')}`);
      }

      const stats = this.workflow.getContentStats(content);
      console.log(`   ✓ Validated (${stats.wordCount} words, ~${stats.readingTime} min read)`);

      // Step 2: Add images if enabled
      if (project.styleConfig.includeImages !== false) {
        console.log('   → Finding images...');
        const enhancedContent = await this.imageService.enhanceContentWithImages(content, 3);
        Object.assign(content, enhancedContent);
        console.log(`   ✓ Added ${content.images.length} image(s)`);
      }

      // Save generated content and iterations to database
      await this.db.savePostContent(post.id, content);

      // Delete old iterations first (in case of re-processing)
      await this.db.deletePostIterations(post.id);

      // Save each iteration with quality ratings
      for (const iteration of iterations) {
        await this.db.savePostIteration(post.id, iteration);
      }
      console.log(`   ✓ Saved content and ${iterations.length} iteration(s) to database`);

      // Step 3: Publish (unless dry-run)
      if (dryRun) {
        console.log('   ⚠️  DRY RUN - Content generated but not published');
        await this.db.updatePost(post.id, { status: 'pending' });
      } else {
        console.log('   → Publishing...');
        await this.publishContent(post, project, content);
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`   ✓ Completed in ${duration}s\n`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`   ❌ Failed: ${errorMessage}\n`);

      await this.db.markPostFailed(post.id, errorMessage);
      await this.db.logError(`Post processing failed: ${errorMessage}`, post.id, project.id, {
        error: error instanceof Error ? error.stack : undefined,
      });
    }
  }

  /**
   * Publish content using the appropriate adapter
   */
  private async publishContent(post: Post, project: ProjectConfig, content: Content): Promise<void> {
    try {
      // Get the appropriate adapter for this platform
      const adapter = await AdapterRegistry.getAdapter(project);

      // Publish the content
      const result = await adapter.publish(content, project);

      if (result.success && result.url) {
        // Mark as published
        await this.db.markPostPublished(post.id, result.url, content);
        await this.db.logInfo(
          `Successfully published: ${result.url}`,
          post.id,
          project.id,
          { publishUrl: result.url }
        );

        console.log(`   ✓ Published: ${result.url}`);
      } else {
        throw new Error(result.error || 'Publishing failed without error message');
      }
    } catch (error) {
      throw new Error(`Publishing failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get active projects with optional filter
   */
  private async getActiveProjects(projectFilter?: string): Promise<ProjectConfig[]> {
    if (projectFilter && projectFilter !== 'all') {
      const project = await this.db.getProjectByName(projectFilter);
      return project && project.isActive ? [project] : [];
    }

    return this.db.getActiveProjects();
  }

  /**
   * Get summary statistics
   */
  async getStatistics(projectId?: string): Promise<{
    pendingCount: number;
    publishedToday: number;
  }> {
    const pending = await this.db.getPendingPosts(projectId);

    // For published today, we'd need to add a query method
    // Simplified for MVP
    return {
      pendingCount: pending.length,
      publishedToday: 0, // TODO: Implement if needed
    };
  }
}
