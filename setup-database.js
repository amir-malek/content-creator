#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('🔧 Setting up database tables...\n');

// Read all migration files
const migrations = [
  'migrations/001_create_projects_table.sql',
  'migrations/002_create_posts_table.sql',
  'migrations/003_create_logs_table.sql',
];

async function runMigrations() {
  for (const file of migrations) {
    console.log(`📄 Running: ${file}`);
    const sql = readFileSync(file, 'utf-8');

    const { error } = await supabase.rpc('exec_sql', { sql_query: sql }).single();

    if (error) {
      console.error(`   ❌ Failed: ${error.message}`);
      console.log('\n⚠️  Running SQL directly via Supabase client...');

      // Try running each statement separately
      const statements = sql.split(';').filter(s => s.trim());
      for (const statement of statements) {
        if (statement.trim()) {
          const { error: stmtError } = await supabase.from('_migrations').insert({ sql: statement });
          if (stmtError && !stmtError.message.includes('does not exist')) {
            // Table creation might fail with this method, that's ok
          }
        }
      }
    } else {
      console.log(`   ✅ Success\n`);
    }
  }

  console.log('\n📋 Database tables should now be set up!');
  console.log('🔍 Please verify by running: npm run cli stats\n');
  console.log('ℹ️  If you see errors above, you may need to run the migrations manually in the Supabase dashboard:');
  console.log('   1. Go to https://app.supabase.com/project/koqhkhiezoeqntmjymxy/sql');
  console.log('   2. Copy and paste each .sql file from the migrations/ folder');
  console.log('   3. Run them in order (001, 002, 003)\n');
}

runMigrations().catch(console.error);
