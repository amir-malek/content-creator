// Database Service - Supabase client and database operations

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  PostRow,
  PostUpdate,
  ProjectRow,
  LogInsert,
  PostIterationInsert,
  PostIterationRow,
} from '../types/database.js';
import { Post, ProjectConfig, Log, Content, IterationHistory } from '../types/index.js';

/**
 * Database service for managing projects, posts, and logs in Supabase
 */
export class DatabaseService {
  private client: SupabaseClient;

  constructor(supabaseUrl: string, supabaseKey: string) {
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase URL and service role key are required');
    }

    this.client = createClient(supabaseUrl, supabaseKey);
    console.log('[Database] Connected to Supabase');
  }

  // ====================
  // PROJECT OPERATIONS
  // ====================

  /**
   * Get active projects
   */
  async getActiveProjects(): Promise<ProjectConfig[]> {
    const { data, error } = await this.client
      .from('projects')
      .select('*')
      .eq('is_active', true)
      .order('name');

    if (error) throw new Error(`Failed to get projects: ${error.message}`);

    return (data || []).map(this.mapProjectRowToConfig);
  }

  /**
   * Get project by name
   */
  async getProjectByName(name: string): Promise<ProjectConfig | null> {
    const { data, error } = await this.client
      .from('projects')
      .select('*')
      .eq('name', name)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      throw new Error(`Failed to get project: ${error.message}`);
    }

    return data ? this.mapProjectRowToConfig(data) : null;
  }

  /**
   * Get project by ID
   */
  async getProjectById(id: string): Promise<ProjectConfig | null> {
    const { data, error } = await this.client.from('projects').select('*').eq('id', id).single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to get project: ${error.message}`);
    }

    return data ? this.mapProjectRowToConfig(data) : null;
  }

  /**
   * Get all projects (including inactive)
   */
  async getAllProjects(): Promise<ProjectConfig[]> {
    const { data, error } = await this.client.from('projects').select('*').order('name');

    if (error) throw new Error(`Failed to get all projects: ${error.message}`);

    return (data || []).map(this.mapProjectRowToConfig);
  }

  /**
   * Create a new project
   */
  async createProject(projectData: any): Promise<ProjectConfig> {
    const { data, error } = await this.client
      .from('projects')
      .insert({
        name: projectData.name,
        platform_type: projectData.platform_type,
        endpoints: projectData.endpoints,
        auth_config: projectData.auth_config,
        parameters: projectData.parameters || {},
        style_config: projectData.style_config || {},
        is_active: projectData.is_active ?? true,
        language: projectData.language || 'en',
        language_config: projectData.language_config || {},
        use_s3_for_images: projectData.use_s3_for_images ?? false,
        s3_config: projectData.s3_config || null,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new Error(`Project with name "${projectData.name}" already exists`);
      }
      throw new Error(`Failed to create project: ${error.message}`);
    }

    return this.mapProjectRowToConfig(data);
  }

  /**
   * Update an existing project
   */
  async updateProject(id: string, updates: any): Promise<void> {
    const { error } = await this.client.from('projects').update(updates).eq('id', id);

    if (error) {
      if (error.code === '23505') {
        throw new Error(`Project with name "${updates.name}" already exists`);
      }
      throw new Error(`Failed to update project: ${error.message}`);
    }
  }

  /**
   * Deactivate a project (soft delete)
   */
  async deactivateProject(id: string): Promise<void> {
    await this.updateProject(id, { is_active: false });
  }

  /**
   * Activate a project
   */
  async activateProject(id: string): Promise<void> {
    await this.updateProject(id, { is_active: true });
  }

  /**
   * Delete a project permanently (hard delete)
   */
  async deleteProject(id: string): Promise<void> {
    const { error } = await this.client.from('projects').delete().eq('id', id);

    if (error) throw new Error(`Failed to delete project: ${error.message}`);
  }

  // ====================
  // POST OPERATIONS
  // ====================

  /**
   * Get pending posts that are due for publishing
   * Smart prioritization: scheduled date first, then retry count (fewer retries = higher priority)
   */
  async getPendingPosts(projectId?: string): Promise<Post[]> {
    let query = this.client
      .from('posts')
      .select('*')
      .eq('status', 'pending')
      .lte('publish_date', new Date().toISOString().split('T')[0]);

    if (projectId) {
      query = query.eq('project_id', projectId);
    }

    // Smart prioritization: scheduled date first (oldest first), then retry count (fresh posts first)
    const { data, error } = await query
      .order('publish_date', { ascending: true })
      .order('retry_count', { ascending: true });

    if (error) throw new Error(`Failed to get pending posts: ${error.message}`);

    return (data || []).map(this.mapPostRowToPost);
  }

  /**
   * Get post by ID
   */
  async getPostById(id: string): Promise<Post | null> {
    const { data, error } = await this.client.from('posts').select('*').eq('id', id).single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to get post: ${error.message}`);
    }

    return data ? this.mapPostRowToPost(data) : null;
  }

  /**
   * Update post status and details
   */
  async updatePost(postId: string, updates: PostUpdate): Promise<void> {
    const { error } = await this.client.from('posts').update(updates).eq('id', postId);

    if (error) throw new Error(`Failed to update post: ${error.message}`);
  }

  /**
   * Mark post as processing
   */
  async markPostProcessing(postId: string): Promise<void> {
    await this.updatePost(postId, { status: 'processing' });
  }

  /**
   * Mark post as published
   */
  async markPostPublished(postId: string, url: string, content?: Content): Promise<void> {
    const updates: PostUpdate = {
      status: 'published',
      published_url: url,
      error_message: undefined,
    };

    if (content) {
      updates.content_json = content as any;
    }

    await this.updatePost(postId, updates);
  }

  /**
   * Mark post as failed and handle retry logic
   */
  async markPostFailed(postId: string, errorMessage: string): Promise<void> {
    const post = await this.getPostById(postId);
    if (!post) throw new Error('Post not found');

    const newRetryCount = post.retryCount + 1;
    const shouldRetry = newRetryCount < post.maxRetries;

    const updates: PostUpdate = {
      status: shouldRetry ? 'pending' : 'failed',
      retry_count: newRetryCount,
      error_message: errorMessage,
    };

    // If retrying, reschedule for next day
    if (shouldRetry) {
      const nextDate = new Date(post.publishDate);
      nextDate.setDate(nextDate.getDate() + 1);
      updates.publish_date = nextDate.toISOString().split('T')[0];
    }

    await this.updatePost(postId, updates);
  }

  /**
   * Save generated content to post
   */
  async savePostContent(postId: string, content: Content): Promise<void> {
    await this.updatePost(postId, {
      content_json: content as any,
    });
  }

  /**
   * Get all posts with optional filters
   */
  async getAllPosts(filters?: {
    projectId?: string;
    status?: 'pending' | 'processing' | 'published' | 'failed';
    startDate?: string;
    endDate?: string;
  }): Promise<Post[]> {
    let query = this.client.from('posts').select('*');

    if (filters?.projectId) {
      query = query.eq('project_id', filters.projectId);
    }

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    if (filters?.startDate) {
      query = query.gte('publish_date', filters.startDate);
    }

    if (filters?.endDate) {
      query = query.lte('publish_date', filters.endDate);
    }

    const { data, error } = await query.order('publish_date', { ascending: false });

    if (error) throw new Error(`Failed to get posts: ${error.message}`);

    return (data || []).map(this.mapPostRowToPost);
  }

  /**
   * Create a new post
   */
  async createPost(postData: any): Promise<Post> {
    const { data, error } = await this.client
      .from('posts')
      .insert({
        project_id: postData.project_id,
        title: postData.title,
        field_niche: postData.field_niche,
        keywords: postData.keywords,
        publish_date: postData.publish_date,
        status: postData.status || 'pending',
        max_retries: postData.max_retries || 3,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create post: ${error.message}`);

    return this.mapPostRowToPost(data);
  }

  /**
   * Delete a post permanently
   */
  async deletePost(id: string): Promise<void> {
    const { error } = await this.client.from('posts').delete().eq('id', id);

    if (error) throw new Error(`Failed to delete post: ${error.message}`);
  }

  // ====================
  // POST ITERATION OPERATIONS
  // ====================

  /**
   * Delete all iterations for a post (used before regenerating content)
   */
  async deletePostIterations(postId: string): Promise<void> {
    const { error } = await this.client
      .from('post_iterations')
      .delete()
      .eq('post_id', postId);

    if (error) {
      console.error('[Database] Failed to delete post iterations:', error);
      // Don't throw - this is non-critical
    }
  }

  /**
   * Save a single post iteration with quality rating
   */
  async savePostIteration(postId: string, iteration: IterationHistory): Promise<void> {
    const iterationData: PostIterationInsert = {
      post_id: postId,
      iteration_number: iteration.iteration_number,
      content_json: iteration.content as any,
      quality_score: iteration.rating.score,
      quality_feedback: iteration.rating.feedback,
      word_count: iteration.rating.word_count,
      structure_score: iteration.rating.structure_score,
      depth_score: iteration.rating.depth_score,
      engagement_score: iteration.rating.engagement_score,
    };

    const { error } = await this.client.from('post_iterations').insert(iterationData);

    if (error) {
      console.error('[Database] Failed to save post iteration:', error);
      throw new Error(`Failed to save post iteration: ${error.message}`);
    }
  }

  /**
   * Get all iterations for a post
   */
  async getPostIterations(postId: string): Promise<IterationHistory[]> {
    const { data, error } = await this.client
      .from('post_iterations')
      .select('*')
      .eq('post_id', postId)
      .order('iteration_number', { ascending: true });

    if (error) throw new Error(`Failed to get post iterations: ${error.message}`);

    return (data || []).map(this.mapIterationRowToHistory);
  }

  /**
   * Get iteration statistics for a post
   */
  async getIterationStats(postId: string): Promise<{
    totalIterations: number;
    initialScore: number;
    finalScore: number;
    improvementRate: number;
  } | null> {
    const iterations = await this.getPostIterations(postId);

    if (iterations.length === 0) return null;

    const initialScore = iterations[0].rating.score;
    const finalScore = iterations[iterations.length - 1].rating.score;
    const improvementRate = ((finalScore - initialScore) / initialScore) * 100;

    return {
      totalIterations: iterations.length,
      initialScore,
      finalScore,
      improvementRate,
    };
  }

  // ====================
  // LOG OPERATIONS
  // ====================

  /**
   * Create a log entry
   */
  async createLog(log: LogInsert): Promise<void> {
    const { error } = await this.client.from('logs').insert(log);

    if (error) {
      console.error('[Database] Failed to create log:', error);
      // Don't throw - logging failures shouldn't break the main flow
    }
  }

  /**
   * Log info message
   */
  async logInfo(message: string, postId?: string, projectId?: string, metadata?: any): Promise<void> {
    await this.createLog({
      level: 'info',
      message,
      post_id: postId,
      project_id: projectId,
      metadata,
    });
  }

  /**
   * Log error message
   */
  async logError(message: string, postId?: string, projectId?: string, metadata?: any): Promise<void> {
    await this.createLog({
      level: 'error',
      message,
      post_id: postId,
      project_id: projectId,
      metadata,
    });
  }

  /**
   * Log warning message
   */
  async logWarning(message: string, postId?: string, projectId?: string, metadata?: any): Promise<void> {
    await this.createLog({
      level: 'warning',
      message,
      post_id: postId,
      project_id: projectId,
      metadata,
    });
  }

  /**
   * Get recent logs for a post
   */
  async getPostLogs(postId: string, limit: number = 50): Promise<Log[]> {
    const { data, error } = await this.client
      .from('logs')
      .select('*')
      .eq('post_id', postId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw new Error(`Failed to get logs: ${error.message}`);

    return (data || []).map(this.mapLogRowToLog);
  }

  // ====================
  // HELPER METHODS
  // ====================

  /**
   * Map database project row to ProjectConfig type
   */
  private mapProjectRowToConfig(row: ProjectRow): ProjectConfig {
    return {
      id: row.id,
      name: row.name,
      platformType: row.platform_type,
      endpoints: row.endpoints,
      authConfig: row.auth_config,
      parameters: row.parameters,
      styleConfig: row.style_config,
      isActive: row.is_active,
      language: row.language || 'en', // Default to English if not specified
      languageConfig: row.language_config,
      useS3ForImages: row.use_s3_for_images || false,
      s3Config: row.s3_config ? (row.s3_config as any) : undefined,
    };
  }

  /**
   * Map database post row to Post type
   */
  private mapPostRowToPost(row: PostRow): Post {
    return {
      id: row.id,
      projectId: row.project_id,
      title: row.title,
      fieldNiche: row.field_niche,
      keywords: row.keywords,
      contentJson: row.content_json as Content | undefined,
      status: row.status,
      publishDate: new Date(row.publish_date),
      retryCount: row.retry_count,
      maxRetries: row.max_retries,
      publishedUrl: row.published_url,
      errorMessage: row.error_message,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      publishedAt: row.published_at ? new Date(row.published_at) : undefined,
    };
  }

  /**
   * Map database log row to Log type
   */
  private mapLogRowToLog(row: any): Log {
    return {
      id: row.id,
      postId: row.post_id,
      projectId: row.project_id,
      level: row.level,
      message: row.message,
      metadata: row.metadata,
      createdAt: new Date(row.created_at),
    };
  }

  /**
   * Map database iteration row to IterationHistory type
   */
  private mapIterationRowToHistory(row: PostIterationRow): IterationHistory {
    return {
      iteration_number: row.iteration_number,
      content: row.content_json as Content,
      rating: {
        score: row.quality_score,
        feedback: row.quality_feedback,
        areas_to_improve: [], // Not stored separately, embedded in feedback
        actionable_improvements: [], // Not stored separately, embedded in feedback
        word_count: row.word_count,
        structure_score: row.structure_score,
        depth_score: row.depth_score,
        engagement_score: row.engagement_score,
      },
    };
  }
}
