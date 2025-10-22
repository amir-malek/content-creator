// Retry utility with exponential backoff

import { RetryConfig } from '../types/index.js';

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000, // 1 second
  maxDelayMs: 30000, // 30 seconds
  backoffMultiplier: 2,
};

/**
 * Execute a function with exponential backoff retry logic
 * @param fn Function to execute
 * @param config Retry configuration
 * @param context Description of operation (for logging)
 * @returns Result of the function
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {},
  context: string = 'Operation'
): Promise<T> {
  const fullConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: Error | unknown;

  for (let attempt = 0; attempt <= fullConfig.maxRetries; attempt++) {
    try {
      // Attempt the operation
      return await fn();
    } catch (error) {
      lastError = error;

      // If this was the last attempt, throw the error
      if (attempt === fullConfig.maxRetries) {
        break;
      }

      // Check if error is retryable
      if (!isRetryableError(error)) {
        console.warn(`[Retry] ${context}: Non-retryable error, not retrying`);
        throw error;
      }

      // Calculate delay with exponential backoff
      const delay = calculateDelay(attempt, fullConfig);

      console.warn(
        `[Retry] ${context}: Attempt ${attempt + 1}/${fullConfig.maxRetries + 1} failed. ` +
          `Retrying in ${delay}ms... Error: ${error instanceof Error ? error.message : String(error)}`
      );

      // Wait before retrying
      await sleep(delay);
    }
  }

  // All retries exhausted
  throw new Error(
    `${context} failed after ${fullConfig.maxRetries + 1} attempts: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`
  );
}

/**
 * Calculate delay for a retry attempt using exponential backoff
 */
function calculateDelay(attempt: number, config: RetryConfig): number {
  const delay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt);
  return Math.min(delay, config.maxDelayMs);
}

/**
 * Determine if an error is retryable
 */
function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return true; // Unknown errors, try to retry
  }

  // Network errors are retryable
  if (error.message.includes('ECONNREFUSED') || error.message.includes('ETIMEDOUT')) {
    return true;
  }

  // Rate limit errors are retryable
  if (error.message.includes('rate limit') || error.message.includes('429')) {
    return true;
  }

  // Temporary server errors are retryable
  if (error.message.includes('503') || error.message.includes('504')) {
    return true;
  }

  // Authentication errors are NOT retryable
  if (
    error.message.includes('401') ||
    error.message.includes('403') ||
    error.message.includes('authentication') ||
    error.message.includes('unauthorized')
  ) {
    return false;
  }

  // Client errors (4xx except rate limit) are NOT retryable
  if (error.message.includes('400') || error.message.includes('404')) {
    return false;
  }

  // Default: retry
  return true;
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a function with simple retry logic (no exponential backoff)
 * @param fn Function to execute
 * @param maxAttempts Maximum number of attempts
 * @param delayMs Delay between attempts in milliseconds
 * @param context Description of operation
 */
export async function retrySimple<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  delayMs: number = 1000,
  context: string = 'Operation'
): Promise<T> {
  let lastError: Error | unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt < maxAttempts - 1) {
        console.warn(
          `[Retry] ${context}: Attempt ${attempt + 1}/${maxAttempts} failed. ` +
            `Retrying in ${delayMs}ms...`
        );
        await sleep(delayMs);
      }
    }
  }

  throw new Error(
    `${context} failed after ${maxAttempts} attempts: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`
  );
}

/**
 * Batch retry - retry multiple operations with exponential backoff
 * Fails if any operation fails after all retries
 */
export async function retryBatch<T>(
  operations: Array<() => Promise<T>>,
  config: Partial<RetryConfig> = {}
): Promise<T[]> {
  return Promise.all(
    operations.map((op, index) => retryWithBackoff(op, config, `Operation ${index + 1}`))
  );
}
