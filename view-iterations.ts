import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function viewIterations() {
  // Get most recent post
  const { data: posts } = await supabase
    .from('posts')
    .select('id, title')
    .order('created_at', { ascending: false })
    .limit(1);

  if (!posts || posts.length === 0) {
    console.log('No posts found');
    return;
  }

  const post = posts[0];
  console.log(`\n📊 Iterations for: ${post.title}\n`);

  // Get all iterations
  const { data: iterations } = await supabase
    .from('post_iterations')
    .select('*')
    .eq('post_id', post.id)
    .order('iteration_number', { ascending: true });

  if (!iterations || iterations.length === 0) {
    console.log('No iterations found');
    return;
  }

  for (const iter of iterations) {
    console.log(`${'='.repeat(80)}`);
    console.log(`ITERATION ${iter.iteration_number}`);
    console.log(`${'='.repeat(80)}`);
    console.log(`Quality Score: ${iter.quality_score}/10`);
    console.log(`Word Count: ${iter.word_count}`);
    console.log(`Structure: ${iter.structure_score}/10`);
    console.log(`Depth: ${iter.depth_score}/10`);
    console.log(`Engagement: ${iter.engagement_score}/10`);
    console.log(`\nFeedback:`);
    console.log(iter.quality_feedback);
    console.log(`\n`);
  }
}

viewIterations();
