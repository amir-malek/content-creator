// Adapter Registry - Dynamically loads platform adapters

import { IPublisher, ProjectConfig } from '../types/index.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

/**
 * Registry for managing publisher adapters
 * Dynamically loads adapters based on platform_type from project config
 */
export class AdapterRegistry {
  private static adapters: Map<string, IPublisher> = new Map();

  /**
   * Get or create a publisher adapter for the given platform type
   * @param config Project configuration containing platform_type
   * @returns Publisher adapter instance
   */
  static async getAdapter(config: ProjectConfig): Promise<IPublisher> {
    const { platformType } = config;
    const cacheKey = `${platformType}-${config.id}`;

    // Return cached adapter if exists
    if (this.adapters.has(cacheKey)) {
      return this.adapters.get(cacheKey)!;
    }

    // Load adapter dynamically
    const adapter = await this.loadAdapter(platformType, config);

    // Authenticate the adapter
    await adapter.authenticate();

    // Cache the adapter
    this.adapters.set(cacheKey, adapter);

    return adapter;
  }

  /**
   * Dynamically import and instantiate an adapter
   * @param platformType Platform type identifier (e.g., 'custom-backend-v1', 'wordpress')
   * @param config Project configuration
   * @returns Publisher adapter instance
   */
  private static async loadAdapter(
    platformType: string,
    config: ProjectConfig
  ): Promise<IPublisher> {
    try {
      // Construct adapter file path
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);
      const adapterPath = join(__dirname, `${platformType}.adapter.js`);

      // Dynamic import of the adapter
      const adapterModule = await import(adapterPath);

      // Get the adapter class (should export default or named export)
      const AdapterClass = adapterModule.default || adapterModule[this.getAdapterClassName(platformType)];

      if (!AdapterClass) {
        throw new Error(`Adapter class not found in ${platformType}.adapter.ts`);
      }

      // Instantiate the adapter with config
      const adapter: IPublisher = new AdapterClass(config);

      return adapter;
    } catch (error) {
      throw new Error(
        `Failed to load adapter for platform type "${platformType}": ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Convert platform type to expected class name
   * Example: 'custom-backend-v1' -> 'CustomBackendV1Adapter'
   */
  private static getAdapterClassName(platformType: string): string {
    return platformType
      .split('-')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join('') + 'Adapter';
  }

  /**
   * Clear cached adapters (useful for testing or config updates)
   */
  static clearCache(): void {
    this.adapters.clear();
  }

  /**
   * Remove specific adapter from cache
   */
  static removeAdapter(platformType: string, projectId: string): void {
    const cacheKey = `${platformType}-${projectId}`;
    this.adapters.delete(cacheKey);
  }

  /**
   * Check if an adapter exists for the given platform type
   * @param platformType Platform type identifier
   * @returns True if adapter file exists
   */
  static async adapterExists(platformType: string): Promise<boolean> {
    try {
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);
      const adapterPath = join(__dirname, `${platformType}.adapter.js`);
      await import(adapterPath);
      return true;
    } catch {
      return false;
    }
  }
}
