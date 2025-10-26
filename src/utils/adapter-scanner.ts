// Adapter Scanner - Auto-detect available platform adapters

import { readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface AdapterInfo {
  platformType: string;
  filename: string;
  path: string;
}

/**
 * Scan the adapters directory and return list of available platform types
 */
export function scanAvailableAdapters(): AdapterInfo[] {
  const adaptersDir = join(__dirname, '..', 'adapters');

  try {
    const files = readdirSync(adaptersDir);

    const adapters = files
      .filter((file) => file.endsWith('.adapter.ts') && file !== 'base.adapter.ts')
      .map((file) => {
        const platformType = file.replace('.adapter.ts', '');
        return {
          platformType,
          filename: file,
          path: join(adaptersDir, file),
        };
      })
      .sort((a, b) => a.platformType.localeCompare(b.platformType));

    return adapters;
  } catch (error) {
    console.error('[AdapterScanner] Failed to scan adapters directory:', error);
    return [];
  }
}

/**
 * Get a list of platform type strings for selection
 */
export function getAvailablePlatformTypes(): string[] {
  return scanAvailableAdapters().map((adapter) => adapter.platformType);
}

/**
 * Check if a platform type exists
 */
export function isValidPlatformType(platformType: string): boolean {
  return getAvailablePlatformTypes().includes(platformType);
}

/**
 * Get adapter info by platform type
 */
export function getAdapterInfo(platformType: string): AdapterInfo | null {
  return scanAvailableAdapters().find((adapter) => adapter.platformType === platformType) || null;
}
