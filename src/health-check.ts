import dotenv from 'dotenv';
import { DatabaseService } from './services/database.service.js';
import { S3Service } from './services/s3.service.js';
import { AdapterRegistry } from './adapters/adapter-registry.js';
import { ProjectConfig } from './types/index.js';
import OpenAI from 'openai';
import { createApi } from 'unsplash-js';

dotenv.config();

interface HealthCheckResult {
  service: string;
  status: 'pass' | 'fail' | 'skipped';
  responseTime?: number;
  message?: string;
  error?: string;
}

interface ProjectAdapterHealthCheck {
  projectName: string;
  projectId: string;
  platformType: string;
  status: 'pass' | 'fail' | 'error';
  responseTime?: number;
  message?: string;
  error?: string;
  s3Requirement: 'required' | 'optional' | 'not-needed';
  s3Status: 'configured' | 'missing' | 'not-needed';
  s3Warning?: string;
}

// Color helpers for console output
const colors = {
  green: (text: string) => `\x1b[32m${text}\x1b[0m`,
  red: (text: string) => `\x1b[31m${text}\x1b[0m`,
  yellow: (text: string) => `\x1b[33m${text}\x1b[0m`,
  cyan: (text: string) => `\x1b[36m${text}\x1b[0m`,
  bold: (text: string) => `\x1b[1m${text}\x1b[0m`,
};

async function checkSupabase(): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return {
        service: 'Supabase',
        status: 'fail',
        error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables',
      };
    }

    const dbService = new DatabaseService(supabaseUrl, supabaseKey);
    const projects = await dbService.getActiveProjects();

    const responseTime = Date.now() - start;
    return {
      service: 'Supabase',
      status: 'pass',
      responseTime,
      message: `Connected successfully (${projects.length} active projects)`,
    };
  } catch (error) {
    return {
      service: 'Supabase',
      status: 'fail',
      responseTime: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function checkOpenAI(): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return {
        service: 'OpenAI GPT',
        status: 'fail',
        error: 'Missing OPENAI_API_KEY environment variable',
      };
    }

    const openai = new OpenAI({ apiKey });
    const models = await openai.models.list();

    const responseTime = Date.now() - start;
    const modelCount = models.data.length;

    return {
      service: 'OpenAI GPT',
      status: 'pass',
      responseTime,
      message: `API accessible (${modelCount} models available)`,
    };
  } catch (error) {
    return {
      service: 'OpenAI GPT',
      status: 'fail',
      responseTime: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function checkSerpAPI(): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    const apiKey = process.env.SERPAPI_KEY;

    if (!apiKey) {
      return {
        service: 'SerpAPI',
        status: 'fail',
        error: 'Missing SERPAPI_KEY environment variable',
      };
    }

    // Create a temporary research service instance
    const { getJson } = await import('serpapi');
    const result = await getJson({
      engine: 'google',
      q: 'test',
      api_key: apiKey,
      num: 1,
    });

    const responseTime = Date.now() - start;

    if (result.organic_results && result.organic_results.length > 0) {
      return {
        service: 'SerpAPI',
        status: 'pass',
        responseTime,
        message: 'Search API accessible',
      };
    } else {
      return {
        service: 'SerpAPI',
        status: 'fail',
        responseTime,
        error: 'No results returned from test search',
      };
    }
  } catch (error) {
    return {
      service: 'SerpAPI',
      status: 'fail',
      responseTime: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function checkUnsplash(): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    const accessKey = process.env.UNSPLASH_ACCESS_KEY;

    if (!accessKey) {
      return {
        service: 'Unsplash',
        status: 'fail',
        error: 'Missing UNSPLASH_ACCESS_KEY environment variable',
      };
    }

    const unsplash = createApi({ accessKey });
    const result = await unsplash.search.getPhotos({
      query: 'test',
      perPage: 1,
    });

    const responseTime = Date.now() - start;

    if (result.errors) {
      return {
        service: 'Unsplash',
        status: 'fail',
        responseTime,
        error: result.errors.join(', '),
      };
    }

    return {
      service: 'Unsplash',
      status: 'pass',
      responseTime,
      message: 'Image search API accessible',
    };
  } catch (error) {
    return {
      service: 'Unsplash',
      status: 'fail',
      responseTime: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function checkS3(): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    const endpoint = process.env.S3_ENDPOINT;
    const accessKeyId = process.env.S3_ACCESS_KEY_ID;
    const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
    const bucketName = process.env.S3_BUCKET_NAME;

    // S3 is optional, so skip if not configured
    if (!endpoint || !accessKeyId || !secretAccessKey || !bucketName) {
      return {
        service: 'S3',
        status: 'skipped',
        message: 'Not configured (optional for Unsplash-only mode)',
      };
    }

    const s3Service = new S3Service();
    const isConfigured = s3Service.isConfigured();

    if (!isConfigured) {
      return {
        service: 'S3',
        status: 'skipped',
        message: 'Not configured (optional)',
      };
    }

    // If S3 is configured, verify we can get the config
    const config = s3Service.getS3Config();
    const responseTime = Date.now() - start;

    if (config) {
      return {
        service: 'S3',
        status: 'pass',
        responseTime,
        message: `Configured for bucket: ${config.bucketName}`,
      };
    } else {
      return {
        service: 'S3',
        status: 'fail',
        responseTime,
        error: 'Configuration validation failed',
      };
    }
  } catch (error) {
    return {
      service: 'S3',
      status: 'fail',
      responseTime: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function checkOpenAIImages(): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return {
        service: 'OpenAI DALL-E',
        status: 'skipped',
        message: 'OpenAI API key not configured',
      };
    }

    // DALL-E is optional, used only if projects specify it
    // Just verify the API key works (already tested in checkOpenAI)
    const responseTime = Date.now() - start;

    return {
      service: 'OpenAI DALL-E',
      status: 'pass',
      responseTime,
      message: 'Available (shares OpenAI API key)',
    };
  } catch (error) {
    return {
      service: 'OpenAI DALL-E',
      status: 'fail',
      responseTime: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Determine if a project requires S3 based on its image source configuration
 */
function determineS3Requirement(project: ProjectConfig): 'required' | 'optional' | 'not-needed' {
  const imageSource = project.styleConfig?.imageSource || 'unsplash';

  if (imageSource === 'openai' || imageSource === 'hybrid') {
    return 'required'; // DALL-E URLs expire in 1 hour, must use S3
  } else if (imageSource === 'unsplash') {
    return 'optional'; // Unsplash URLs are permanent, S3 is optional
  } else if (imageSource === 'none') {
    return 'not-needed'; // No images = no S3 needed
  }

  return 'optional'; // Default to optional for unknown sources
}

/**
 * Check if S3 is configured for a project
 */
function checkProjectS3(project: ProjectConfig, s3Service: S3Service): 'configured' | 'missing' | 'not-needed' {
  const requirement = determineS3Requirement(project);

  if (requirement === 'not-needed') {
    return 'not-needed';
  }

  // Check if S3 is configured (either globally or per-project)
  const isConfigured = s3Service.isConfigured(project);

  return isConfigured ? 'configured' : 'missing';
}

/**
 * Test a single project's adapter authentication
 */
async function checkSingleProjectAdapter(
  project: ProjectConfig,
  dbService: DatabaseService,
  s3Service: S3Service
): Promise<ProjectAdapterHealthCheck> {
  const start = Date.now();

  try {
    // Check if adapter file exists
    const adapterExists = await AdapterRegistry.adapterExists(project.platformType);
    if (!adapterExists) {
      const s3Requirement = determineS3Requirement(project);
      const s3Status = checkProjectS3(project, s3Service);

      return {
        projectName: project.name,
        projectId: project.id,
        platformType: project.platformType,
        status: 'error',
        responseTime: Date.now() - start,
        error: `Adapter file not found: ${project.platformType}.adapter.ts`,
        s3Requirement,
        s3Status,
        s3Warning: s3Requirement === 'required' && s3Status === 'missing'
          ? `${project.styleConfig?.imageSource === 'hybrid' ? 'Hybrid mode' : 'DALL-E images'} require S3 storage`
          : undefined,
      };
    }

    // Load and authenticate adapter
    const adapter = await AdapterRegistry.getAdapter(project);

    // Check S3 configuration
    const s3Requirement = determineS3Requirement(project);
    const s3Status = checkProjectS3(project, s3Service);

    const responseTime = Date.now() - start;

    return {
      projectName: project.name,
      projectId: project.id,
      platformType: project.platformType,
      status: 'pass',
      responseTime,
      message: 'Authenticated successfully',
      s3Requirement,
      s3Status,
      s3Warning: s3Requirement === 'required' && s3Status === 'missing'
        ? `${project.styleConfig?.imageSource === 'hybrid' ? 'Hybrid mode' : 'DALL-E images'} require S3 storage`
        : undefined,
    };
  } catch (error) {
    const s3Requirement = determineS3Requirement(project);
    const s3Status = checkProjectS3(project, s3Service);

    return {
      projectName: project.name,
      projectId: project.id,
      platformType: project.platformType,
      status: 'fail',
      responseTime: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown error',
      s3Requirement,
      s3Status,
      s3Warning: s3Requirement === 'required' && s3Status === 'missing'
        ? `${project.styleConfig?.imageSource === 'hybrid' ? 'Hybrid mode' : 'DALL-E images'} require S3 storage`
        : undefined,
    };
  }
}

/**
 * Check all active project adapters
 */
async function checkProjectAdapters(
  dbService: DatabaseService,
  s3Service: S3Service
): Promise<ProjectAdapterHealthCheck[]> {
  try {
    const projects = await dbService.getActiveProjects();

    if (projects.length === 0) {
      return [];
    }

    const results: ProjectAdapterHealthCheck[] = [];

    for (const project of projects) {
      const result = await checkSingleProjectAdapter(project, dbService, s3Service);
      results.push(result);
    }

    return results;
  } catch (error) {
    console.error(colors.red('Failed to check project adapters:'), error);
    return [];
  }
}

function printResult(result: HealthCheckResult): void {
  const statusSymbol = result.status === 'pass' ? '✅' : result.status === 'fail' ? '❌' : '⚠️';
  const statusText = result.status === 'pass'
    ? colors.green('OK')
    : result.status === 'fail'
    ? colors.red('FAIL')
    : colors.yellow('SKIPPED');

  const serviceName = result.service.padEnd(20);
  const timeStr = result.responseTime ? `(${result.responseTime}ms)` : '';

  console.log(`${statusSymbol} ${serviceName} ${statusText} ${colors.cyan(timeStr)}`);

  if (result.message) {
    console.log(`   ${colors.cyan('→')} ${result.message}`);
  }

  if (result.error) {
    console.log(`   ${colors.red('✗')} ${result.error}`);
  }
}

/**
 * Print project adapter health check result
 */
function printProjectResult(result: ProjectAdapterHealthCheck): void {
  const statusSymbol = result.status === 'pass' ? '✅' : result.status === 'fail' ? '❌' : '⚠️';
  const statusText = result.status === 'pass'
    ? colors.green('OK')
    : result.status === 'fail'
    ? colors.red('FAIL')
    : colors.yellow('ERROR');

  const projectLabel = `${result.projectName} (${result.platformType})`.padEnd(40);
  const timeStr = result.responseTime ? `(${result.responseTime}ms)` : '';

  console.log(`${statusSymbol} ${projectLabel} ${statusText} ${colors.cyan(timeStr)}`);

  if (result.message) {
    console.log(`   ${colors.cyan('→')} ${result.message}`);
  }

  if (result.error) {
    console.log(`   ${colors.red('✗')} ${result.error}`);
  }

  // Print S3 status
  const s3Icon = result.s3Status === 'configured' ? '✓' : result.s3Status === 'missing' ? '✗' : '-';
  const s3Color = result.s3Status === 'configured' ? colors.green : result.s3Status === 'missing' ? colors.red : colors.cyan;
  const s3Label = result.s3Requirement === 'required' ? 'Required' : result.s3Requirement === 'optional' ? 'Optional' : 'Not needed';
  const s3StatusText = result.s3Status === 'configured' ? 'configured' : result.s3Status === 'missing' ? 'NOT configured' : 'not needed';

  console.log(`   ${colors.cyan('→')} S3: ${s3Label} ${s3Color(`(${s3StatusText})`)}`);

  if (result.s3Warning) {
    console.log(`   ${colors.yellow('⚠️')}  ${colors.yellow(result.s3Warning)}`);
  }
}

async function runHealthCheck(): Promise<void> {
  console.log(colors.bold('\n🏥 Running Health Checks...\n'));

  const results: HealthCheckResult[] = [];

  // Run all health checks
  console.log(colors.bold('Required Services:'));
  results.push(await checkSupabase());
  printResult(results[results.length - 1]);

  results.push(await checkOpenAI());
  printResult(results[results.length - 1]);

  results.push(await checkSerpAPI());
  printResult(results[results.length - 1]);

  results.push(await checkUnsplash());
  printResult(results[results.length - 1]);

  console.log(colors.bold('\nOptional Services:'));
  results.push(await checkS3());
  printResult(results[results.length - 1]);

  results.push(await checkOpenAIImages());
  printResult(results[results.length - 1]);

  // Check project adapters
  console.log(colors.bold('\nProject-Specific Adapter Checks:'));

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  let projectResults: ProjectAdapterHealthCheck[] = [];

  if (supabaseUrl && supabaseKey) {
    const dbService = new DatabaseService(supabaseUrl, supabaseKey);
    const s3Service = new S3Service();

    projectResults = await checkProjectAdapters(dbService, s3Service);

    if (projectResults.length === 0) {
      console.log(colors.yellow('   ⚠️  No active projects found in database'));
    } else {
      for (const projectResult of projectResults) {
        printProjectResult(projectResult);
      }
    }
  } else {
    console.log(colors.yellow('   ⚠️  Skipped (Supabase not configured)'));
  }

  // Print summary
  const passed = results.filter(r => r.status === 'pass').length;
  const failed = results.filter(r => r.status === 'fail').length;
  const skipped = results.filter(r => r.status === 'skipped').length;
  const requiredServices = results.filter(r => !['S3', 'OpenAI DALL-E'].includes(r.service));
  const requiredPassed = requiredServices.filter(r => r.status === 'pass').length;
  const requiredTotal = requiredServices.length;

  // Project adapter stats
  const projectPassed = projectResults.filter(r => r.status === 'pass').length;
  const projectFailed = projectResults.filter(r => r.status === 'fail').length;
  const projectError = projectResults.filter(r => r.status === 'error').length;
  const projectTotal = projectResults.length;

  console.log(colors.bold('\n📊 Summary:'));
  console.log(`   ${colors.green(`✓ ${passed} passed`)}`);
  if (failed > 0) {
    console.log(`   ${colors.red(`✗ ${failed} failed`)}`);
  }
  if (skipped > 0) {
    console.log(`   ${colors.yellow(`⚠ ${skipped} skipped`)}`);
  }

  console.log(colors.bold(`\n🎯 Required Services: ${requiredPassed}/${requiredTotal} healthy`));

  if (projectTotal > 0) {
    const projectHealthy = projectPassed === projectTotal;
    const projectStatusText = projectHealthy
      ? colors.green(`${projectPassed}/${projectTotal} healthy`)
      : colors.red(`${projectPassed}/${projectTotal} healthy`);
    console.log(colors.bold(`🔌 Project Adapters: ${projectStatusText}`));
  }

  console.log('');

  // Exit with error code if any required service or project adapter failed
  const anyRequiredFailed = requiredServices.some(r => r.status === 'fail');
  const anyProjectFailed = projectFailed > 0 || projectError > 0;

  if (anyRequiredFailed || anyProjectFailed) {
    console.log(colors.red('❌ Health check failed! Please fix the errors above.\n'));
    process.exit(1);
  } else {
    console.log(colors.green('✅ All services and project adapters are healthy!\n'));
    process.exit(0);
  }
}

// Run the health check
runHealthCheck().catch(error => {
  console.error(colors.red('\n💥 Health check crashed:'), error);
  process.exit(1);
});
