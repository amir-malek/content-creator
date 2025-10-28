import * as dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import DuospaceAdapter from "./src/adapters/duospace.adapter.js";

dotenv.config();

async function testDuoSpaceAPI() {
  console.log("🧪 Testing DuoSpace API with Cloudflare Bypass\n");

  // 1. Get the DuoSpace project config from database
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("*")
    .eq("name", "duospace")
    .single();

  if (projectError || !project) {
    console.error("❌ Failed to fetch DuoSpace project:", projectError);
    return;
  }

  console.log("✓ Found DuoSpace project");

  // Transform database snake_case to TypeScript camelCase
  const projectConfig = {
    id: project.id,
    name: project.name,
    platformType: project.platform_type,
    endpoints: project.endpoints,
    authConfig: project.auth_config,
    parameters: project.parameters,
    styleConfig: project.style_config,
    isActive: project.is_active,
    language: project.language,
    languageConfig: project.language_config,
  };

  // 2. Get the most recent generated content
  const { data: post, error: postError } = await supabase
    .from("posts")
    .select("*")
    .eq("project_id", project.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (postError || !post || !post.content_json) {
    console.error("❌ Failed to fetch recent post content:", postError);
    return;
  }

  console.log(`✓ Found post: "${post.title}"`);
  console.log(`  Word count: ${post.content_json.body?.split(" ").length || 0} words\n`);

  // 3. Test authentication
  console.log("🔐 Testing Authentication...");
  const adapter = new DuospaceAdapter(projectConfig);

  try {
    await adapter.authenticate();
    console.log("✓ Authentication successful!\n");
  } catch (error: any) {
    console.error("❌ Authentication failed:", error.message);
    return;
  }

  // 4. Test publishing with existing content
  console.log("📤 Testing Publishing...");
  try {
    const result = await adapter.publish(post.content_json, projectConfig);

    if (result.success) {
      console.log("✓ Publishing successful!");
      console.log(`  Published URL: ${result.url}`);
      console.log(`  Message: ${result.message}`);
    } else {
      console.error("❌ Publishing failed:", result.error);
    }
  } catch (error: any) {
    console.error("❌ Publishing error:", error.message);
  }
}

testDuoSpaceAPI().catch(console.error);
