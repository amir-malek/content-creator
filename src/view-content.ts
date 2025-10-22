#!/usr/bin/env node
// View generated content from database

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

async function viewContent() {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: posts, error } = await supabase
    .from('posts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('\n' + '='.repeat(80));
  console.log('📄 GENERATED BLOG POST');
  console.log('='.repeat(80) + '\n');

  console.log(`📌 Title: ${posts.title}`);
  console.log(`🏷️  Niche: ${posts.field_niche}`);
  console.log(`🔖 Keywords: ${posts.keywords?.join(', ')}`);
  console.log(`📊 Status: ${posts.status}`);
  console.log(`🔗 Published URL: ${posts.published_url || 'N/A'}`);
  console.log(`📅 Created: ${new Date(posts.created_at).toLocaleString()}\n`);

  if (posts.content_json) {
    const content = posts.content_json;

    console.log('='.repeat(80));
    console.log('📝 CONTENT');
    console.log('='.repeat(80) + '\n');

    console.log(content.body);

    console.log('\n' + '='.repeat(80));
    console.log('🖼️  IMAGES');
    console.log('='.repeat(80) + '\n');

    content.images?.forEach((img: any, i: number) => {
      console.log(`${i + 1}. ${img.url}`);
      console.log(`   Alt: ${img.alt}`);
      if (img.caption) console.log(`   Caption: ${img.caption}`);
      console.log();
    });

    console.log('='.repeat(80));
    console.log('📊 METADATA');
    console.log('='.repeat(80) + '\n');

    console.log(`Tags: ${content.metadata?.tags?.join(', ')}`);
    console.log(`Categories: ${content.metadata?.categories?.join(', ') || 'None'}`);
    console.log(`Publish Date: ${new Date(content.metadata?.publishDate).toLocaleString()}`);

    if (content.metadata?.customFields) {
      console.log('\nCustom Fields:');
      Object.entries(content.metadata.customFields).forEach(([key, value]) => {
        console.log(`  ${key}: ${value}`);
      });
    }

    console.log('\n' + '='.repeat(80) + '\n');
  } else {
    console.log('⚠️  No content generated yet\n');
  }
}

viewContent().catch(console.error);
