# Database Migrations

This directory contains SQL migration files for setting up the Supabase database schema.

## Running Migrations

### Option 1: Supabase Dashboard (Recommended for initial setup)

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Run each migration file in order:
   - `001_create_projects_table.sql`
   - `002_create_posts_table.sql`
   - `003_create_logs_table.sql`

### Option 2: Using Supabase CLI

```bash
# Install Supabase CLI if not already installed
npm install -g supabase

# Link your project
supabase link --project-ref your-project-ref

# Run migrations
supabase db push
```

## Migration Files

- **001_create_projects_table.sql**: Creates the projects table for storing platform configurations
- **002_create_posts_table.sql**: Creates the posts table for managing the publishing queue
- **003_create_logs_table.sql**: Creates the logs table for tracking system activity

## Schema Overview

### projects
Stores configuration for each blog project/platform including API endpoints, authentication, and style preferences.

### posts
Manages the queue of posts to be published with status tracking and retry logic.

### logs
Records system activity, errors, and events for monitoring and debugging.

## Notes

- All tables use UUID primary keys
- Timestamps are automatically managed with triggers
- Foreign key constraints ensure data integrity
- Indexes are created for optimal query performance
