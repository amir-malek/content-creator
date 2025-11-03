// Prompt Helpers - Reusable interactive prompt functions

import { input, select, confirm } from '@inquirer/prompts';
import { getAvailablePlatformTypes } from './adapter-scanner.js';

/**
 * Common language codes with names
 */
export const SUPPORTED_LANGUAGES = [
  { value: 'en', name: 'English' },
  { value: 'es', name: 'Spanish' },
  { value: 'fr', name: 'French' },
  { value: 'de', name: 'German' },
  { value: 'it', name: 'Italian' },
  { value: 'pt', name: 'Portuguese' },
  { value: 'ru', name: 'Russian' },
  { value: 'ja', name: 'Japanese' },
  { value: 'zh', name: 'Chinese' },
  { value: 'ko', name: 'Korean' },
  { value: 'ar', name: 'Arabic' },
  { value: 'hi', name: 'Hindi' },
  { value: 'he', name: 'Hebrew' },
  { value: 'fa', name: 'Persian' },
  { value: 'tr', name: 'Turkish' },
  { value: 'pl', name: 'Polish' },
  { value: 'nl', name: 'Dutch' },
  { value: 'sv', name: 'Swedish' },
  { value: 'da', name: 'Danish' },
  { value: 'fi', name: 'Finnish' },
];

/**
 * Validate JSON string
 */
export function validateJSON(value: string): boolean | string {
  if (!value.trim()) {
    return 'JSON cannot be empty';
  }

  try {
    JSON.parse(value);
    return true;
  } catch (error) {
    return 'Invalid JSON format. Please enter valid JSON.';
  }
}

/**
 * Validate URL
 */
export function validateURL(value: string): boolean | string {
  try {
    new URL(value);
    return true;
  } catch {
    return 'Invalid URL format';
  }
}

/**
 * Validate required field
 */
export function validateRequired(value: string): boolean | string {
  return value.trim() ? true : 'This field is required';
}

/**
 * Validate date format (YYYY-MM-DD)
 */
export function validateDate(value: string): boolean | string {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(value)) {
    return 'Invalid date format. Use YYYY-MM-DD';
  }

  const date = new Date(value);
  if (isNaN(date.getTime())) {
    return 'Invalid date';
  }

  return true;
}

/**
 * Prompt for project name
 */
export async function promptProjectName(defaultValue?: string): Promise<string> {
  return input({
    message: 'Project name:',
    default: defaultValue,
    validate: validateRequired,
  });
}

/**
 * Prompt for platform type selection
 */
export async function promptPlatformType(defaultValue?: string): Promise<string> {
  const availableAdapters = getAvailablePlatformTypes();

  if (availableAdapters.length === 0) {
    throw new Error('No platform adapters found in src/adapters/');
  }

  return select({
    message: 'Select platform type:',
    choices: availableAdapters.map((adapter) => ({
      value: adapter,
      name: `${adapter} (src/adapters/${adapter}.adapter.ts)`,
    })),
    default: defaultValue,
  });
}

/**
 * Prompt for JSON input with validation
 */
export async function promptJSON(
  message: string,
  defaultValue?: string,
  required: boolean = true
): Promise<any> {
  const jsonString = await input({
    message,
    default: defaultValue || '{}',
    validate: required ? validateJSON : (value) => !value || validateJSON(value),
  });

  return JSON.parse(jsonString);
}

/**
 * Prompt for endpoints JSON
 */
export async function promptEndpoints(defaultValue?: any): Promise<any> {
  console.log('\n💡 Endpoints format: {"publish": "https://...", "auth": "https://..."}');
  return promptJSON('Endpoints (JSON):', JSON.stringify(defaultValue || {}, null, 2));
}

/**
 * Prompt for auth config JSON
 */
export async function promptAuthConfig(defaultValue?: any): Promise<any> {
  console.log('\n💡 Auth config format: {"token": "...", "apiKey": "..."}');
  return promptJSON('Auth config (JSON):', JSON.stringify(defaultValue || {}, null, 2));
}

/**
 * Prompt for parameters JSON (optional)
 */
export async function promptParameters(defaultValue?: any): Promise<any> {
  console.log('\n💡 Parameters (optional): {"headers": {...}, "defaultStatus": "publish"}');
  const jsonString = await input({
    message: 'Parameters (JSON) [optional, press Enter to skip]:',
    default: JSON.stringify(defaultValue || {}, null, 2),
  });

  return jsonString.trim() ? JSON.parse(jsonString) : {};
}

/**
 * Prompt for style config with guided prompts
 */
export async function promptStyleConfig(defaultValue?: any): Promise<any> {
  console.log('\n📝 Content Style Configuration\n');

  const tone = await select({
    message: 'Content tone:',
    choices: [
      { value: 'professional', name: 'Professional' },
      { value: 'casual', name: 'Casual' },
      { value: 'formal', name: 'Formal' },
      { value: 'friendly', name: 'Friendly' },
      { value: 'technical', name: 'Technical' },
    ],
    default: defaultValue?.tone || 'professional',
  });

  const length = await select({
    message: 'Content length:',
    choices: [
      { value: 'short', name: 'Short (500-800 words)' },
      { value: 'medium', name: 'Medium (1000-1500 words)' },
      { value: 'long', name: 'Long (2000+ words)' },
    ],
    default: defaultValue?.length || 'medium',
  });

  const includeImages = await confirm({
    message: 'Include images in posts?',
    default: defaultValue?.includeImages ?? true,
  });

  const customInstructions = await input({
    message: 'Custom instructions [optional]:',
    default: defaultValue?.customInstructions || '',
  });

  return {
    tone,
    length,
    includeImages,
    ...(customInstructions && { customInstructions }),
  };
}

/**
 * Prompt for language selection
 */
export async function promptLanguage(defaultValue?: string): Promise<string> {
  return select({
    message: 'Select language:',
    choices: SUPPORTED_LANGUAGES,
    default: defaultValue || 'en',
  });
}

/**
 * Prompt for language config (optional)
 */
export async function promptLanguageConfig(_language: string, defaultValue?: any): Promise<any> {
  const needsConfig = await confirm({
    message: 'Add advanced language configuration?',
    default: false,
  });

  if (!needsConfig) {
    return {};
  }

  console.log('\n💡 Example: {"regionalVariant": "es-MX", "scriptDirection": "ltr"}');
  return promptJSON('Language config (JSON):', JSON.stringify(defaultValue || {}, null, 2), false);
}

/**
 * Prompt for post title
 */
export async function promptPostTitle(defaultValue?: string): Promise<string> {
  return input({
    message: 'Post title:',
    default: defaultValue,
    validate: validateRequired,
  });
}

/**
 * Prompt for field/niche
 */
export async function promptFieldNiche(defaultValue?: string): Promise<string> {
  return input({
    message: 'Field/Niche (e.g., Technology, Health, Finance):',
    default: defaultValue,
    validate: validateRequired,
  });
}

/**
 * Prompt for keywords
 */
export async function promptKeywords(defaultValue?: string[]): Promise<string[]> {
  const keywordsString = await input({
    message: 'Keywords (comma-separated):',
    default: defaultValue?.join(', ') || '',
    validate: validateRequired,
  });

  return keywordsString.split(',').map((k) => k.trim());
}

/**
 * Prompt for publish date
 */
export async function promptPublishDate(defaultValue?: string): Promise<string> {
  const today = new Date().toISOString().split('T')[0];

  return input({
    message: 'Publish date (YYYY-MM-DD):',
    default: defaultValue || today,
    validate: validateDate,
  });
}

/**
 * Prompt for confirmation
 */
export async function promptConfirm(message: string, defaultValue: boolean = false): Promise<boolean> {
  return confirm({ message, default: defaultValue });
}

/**
 * Prompt for selection from list
 */
export async function promptSelect<T extends string>(
  message: string,
  choices: Array<{ value: T; name: string; description?: string }>,
  defaultValue?: T
): Promise<T> {
  return select({ message, choices, default: defaultValue });
}

/**
 * Format JSON for display
 */
export function formatJSON(obj: any): string {
  return JSON.stringify(obj, null, 2);
}

/**
 * Truncate long text for display
 */
export function truncate(text: string, maxLength: number = 50): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

/**
 * Prompt to enable S3 image upload
 */
export async function promptEnableS3(defaultValue: boolean = false): Promise<boolean> {
  return confirm({
    message: 'Upload images to S3 storage?',
    default: defaultValue,
  });
}

/**
 * Prompt for S3 configuration
 * Returns null if user wants to use global configuration
 */
export async function promptS3Config(): Promise<any | null> {
  // Check if global S3 config exists
  const hasGlobalConfig =
    process.env.S3_ENDPOINT &&
    process.env.S3_ACCESS_KEY_ID &&
    process.env.S3_SECRET_ACCESS_KEY &&
    process.env.S3_BUCKET_NAME;

  if (hasGlobalConfig) {
    console.log('\n   ℹ️  Global S3 configuration detected in environment variables');
    const useGlobal = await confirm({
      message: 'Use global S3 configuration?',
      default: true,
    });

    if (useGlobal) {
      return null; // Use global config
    }
  }

  console.log('\n   📦 Enter S3 credentials (or press Ctrl+C to use global config):\n');

  const endpoint = await input({
    message: 'S3 endpoint URL:',
    default: 'https://s3.ir-thr-at1.arvanstorage.ir',
    validate: validateURL,
  });

  const bucket = await input({
    message: 'S3 bucket name:',
    validate: validateRequired,
  });

  const accessKeyId = await input({
    message: 'S3 access key ID:',
    validate: validateRequired,
  });

  const secretAccessKey = await input({
    message: 'S3 secret access key:',
    validate: validateRequired,
  });

  const region = await input({
    message: 'S3 region:',
    default: 'ir-thr-at1',
    validate: validateRequired,
  });

  const publicUrl = await input({
    message: 'S3 public URL (optional, press Enter to skip):',
    default: '',
  });

  return {
    endpoint,
    bucket,
    accessKeyId,
    secretAccessKey,
    region,
    publicUrl: publicUrl || undefined,
  };
}
