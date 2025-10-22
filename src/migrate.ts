#!/usr/bin/env node
// Database Migration Tool - Automatically creates tables in Supabase

import { Client } from 'pg';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const migrationsDir = join(__dirname, '..', 'migrations');

/**
 * Get all migration files sorted by name
 */
function getMigrationFiles(): string[] {
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql') && /^\d{3}_/.test(f))
    .sort();
  return files;
}

/**
 * Get PostgreSQL connection string from Supabase URL
 */
function getConnectionString(): string {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  // Extract project ref from Supabase URL
  // Format: https://PROJECT_REF.supabase.co
  const projectRef = supabaseUrl.replace('https://', '').split('.')[0];

  // Supabase PostgreSQL connection string
  // Format: postgresql://postgres:[YOUR-PASSWORD]@db.PROJECT_REF.supabase.co:5432/postgres

  // For direct database access, we need the database password, not the service role key
  // Let's try using the Supabase pooler connection with service role key

  return `postgresql://postgres.${projectRef}:${serviceRoleKey}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`;
}

/**
 * Run migrations using direct PostgreSQL connection
 */
async function runMigrations() {
  console.log('\n🔧 Content Creator - Database Migrator');
  console.log('==========================================\n');

  const files = getMigrationFiles();

  console.log(`📋 Found ${files.length} migration file(s):\n`);
  files.forEach((f, i) => {
    console.log(`   ${i + 1}. ${f}`);
  });

  console.log('\n⏳ Connecting to database...\n');

  // Try direct connection via Supabase pooler
  let connectionString: string;

  try {
    const supabaseUrl = process.env.SUPABASE_URL!;
    const dbPassword = process.env.SUPABASE_DB_PASSWORD;

    if (!dbPassword) {
      throw new Error('SUPABASE_DB_PASSWORD is required for migrations');
    }

    const projectRef = supabaseUrl.replace('https://', '').split('.')[0];

    // Direct database connection with database password
    // Format: postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres
    connectionString = `postgresql://postgres:${dbPassword}@db.${projectRef}.supabase.co:5432/postgres`;

  } catch (err) {
    console.error('❌ Could not construct connection string');
    console.error('\n📝 Please run migrations manually via Supabase dashboard:');
    console.error('   npm run migrate:manual\n');
    process.exit(1);
  }

  const client = new Client({
    connectionString,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    await client.connect();
    console.log('✅ Connected to database\n');

    // Run each migration
    for (const file of files) {
      const filepath = join(migrationsDir, file);
      const sql = readFileSync(filepath, 'utf-8');

      console.log(`📄 Running: ${file}`);

      try {
        await client.query(sql);
        console.log(`   ✅ Success\n`);
      } catch (error: any) {
        // Check if error is "already exists" - that's OK
        if (error.message.includes('already exists')) {
          console.log(`   ℹ️  Already exists (skipping)\n`);
        } else {
          console.error(`   ❌ Error: ${error.message}\n`);

          // For critical errors, show manual option
          if (error.message.includes('syntax') || error.message.includes('permission')) {
            console.log(`   ⚠️  This migration may need manual execution\n`);
          }
        }
      }
    }

    console.log('✨ Migration process complete!\n');
    console.log('✅ Verify with: npm run cli stats\n');

  } catch (error: any) {
    console.error('\n❌ Connection failed:', error.message);
    console.error('\n📝 Falling back to manual migration instructions...\n');
    console.error('Run this command to see SQL to copy:');
    console.error('   npm run migrate:manual\n');
    process.exit(1);
  } finally {
    await client.end();
  }
}

/**
 * Main execution
 */
async function main() {
  try {
    await runMigrations();
  } catch (error: any) {
    console.error('\n❌ Migration failed:', error.message);
    console.error('\n📝 Please run migrations manually:');
    const projectRef = process.env.SUPABASE_URL?.split('.')[0].replace('https://', '');
    console.error(`   1. Go to: https://app.supabase.com/project/${projectRef}/sql`);
    console.error('   2. Run: npm run migrate:manual (to see SQL)\n');
    process.exit(1);
  }
}

main();
