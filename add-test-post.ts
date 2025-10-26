import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function addTestPost() {
  // Get the first project
  const { data: projects } = await supabase
    .from('projects')
    .select('id')
    .limit(1)
    .single();

  if (!projects) {
    console.log('No projects found');
    return;
  }

  // Add a test post
  const { data, error } = await supabase
    .from('posts')
    .insert({
      project_id: projects.id,
      title: 'The potential role of AI in modern relationships',
      field_niche: 'Relationships and Technology',
      keywords: ['AI', 'relationships', 'technology'],
      publish_date: new Date().toISOString().split('T')[0],
      status: 'pending'
    })
    .select();

  if (error) {
    console.error('Error:', error);
  } else {
    console.log('✅ Test post added:', data);
  }
}

addTestPost();
