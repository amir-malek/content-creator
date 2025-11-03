// Database types matching Supabase schema

/**
 * Raw database row types (snake_case as stored in Postgres)
 */

export interface ProjectRow {
  id: string;
  name: string;
  platform_type: string;
  endpoints: Record<string, string>;
  auth_config: Record<string, any>;
  parameters: Record<string, any>;
  style_config: Record<string, any>;
  is_active: boolean;
  language: string; // ISO 639-1 code (en, es, ja, etc.)
  language_config: Record<string, any>; // LanguageConfig as JSON
  use_s3_for_images?: boolean; // Enable S3 upload for images
  s3_config?: Record<string, any> | null; // S3Config as JSON (per-project credentials)
  created_at: string;
  updated_at: string;
}

export interface PostRow {
  id: string;
  project_id: string;
  title: string;
  field_niche?: string;
  keywords?: string[];
  content_json?: any;
  status: 'pending' | 'processing' | 'published' | 'failed';
  publish_date: string;
  retry_count: number;
  max_retries: number;
  published_url?: string;
  error_message?: string;
  language?: string; // ISO 639-1 code, inherited from project
  created_at: string;
  updated_at: string;
  published_at?: string;
}

export interface LogRow {
  id: string;
  post_id?: string;
  project_id?: string;
  level: 'info' | 'warning' | 'error' | 'debug';
  message: string;
  metadata?: Record<string, any>;
  created_at: string;
}

export interface PostIterationRow {
  id: string;
  post_id: string;
  iteration_number: number;
  content_json: any;
  quality_score: number;
  quality_feedback: string;
  word_count: number;
  structure_score: number;
  depth_score: number;
  engagement_score: number;
  created_at: string;
}

/**
 * Insert types (fields required when creating new records)
 */

export interface ProjectInsert {
  name: string;
  platform_type: string;
  endpoints: Record<string, string>;
  auth_config: Record<string, any>;
  parameters?: Record<string, any>;
  style_config?: Record<string, any>;
  is_active?: boolean;
  language?: string;
  language_config?: Record<string, any>;
  use_s3_for_images?: boolean;
  s3_config?: Record<string, any> | null;
}

export interface PostInsert {
  project_id: string;
  title: string;
  field_niche?: string;
  keywords?: string[];
  publish_date: string;
  status?: 'pending' | 'processing' | 'published' | 'failed';
  max_retries?: number;
}

export interface LogInsert {
  post_id?: string;
  project_id?: string;
  level: 'info' | 'warning' | 'error' | 'debug';
  message: string;
  metadata?: Record<string, any>;
}

export interface PostIterationInsert {
  post_id: string;
  iteration_number: number;
  content_json: any;
  quality_score: number;
  quality_feedback: string;
  word_count: number;
  structure_score: number;
  depth_score: number;
  engagement_score: number;
}

/**
 * Update types (all fields optional for updates)
 */

export interface ProjectUpdate {
  name?: string;
  platform_type?: string;
  endpoints?: Record<string, string>;
  auth_config?: Record<string, any>;
  parameters?: Record<string, any>;
  style_config?: Record<string, any>;
  is_active?: boolean;
  language?: string;
  language_config?: Record<string, any>;
  use_s3_for_images?: boolean;
  s3_config?: Record<string, any> | null;
}

export interface PostUpdate {
  title?: string;
  field_niche?: string;
  keywords?: string[];
  content_json?: any;
  status?: 'pending' | 'processing' | 'published' | 'failed';
  publish_date?: string;
  retry_count?: number;
  published_url?: string;
  error_message?: string;
}

/**
 * Database schema for Supabase client typing
 */
export interface Database {
  public: {
    Tables: {
      projects: {
        Row: ProjectRow;
        Insert: ProjectInsert;
        Update: ProjectUpdate;
      };
      posts: {
        Row: PostRow;
        Insert: PostInsert;
        Update: PostUpdate;
      };
      logs: {
        Row: LogRow;
        Insert: LogInsert;
        Update: Partial<LogRow>;
      };
      post_iterations: {
        Row: PostIterationRow;
        Insert: PostIterationInsert;
        Update: Partial<PostIterationRow>;
      };
    };
  };
}
