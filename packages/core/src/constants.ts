/**
 * SDK Constants and Environment Detection
 *
 * Provides reliable environment detection for production safeguards.
 * These constants can be replaced at build time by bundlers (webpack, vite, esbuild)
 * for reliable dead code elimination.
 */

/**
 * Production mode flag.
 *
 * This constant is designed to be replaced at build time by bundlers:
 * - Webpack: DefinePlugin({ '__MIDNIGHT_CLOAK_PRODUCTION__': JSON.stringify(true) })
 * - Vite: define: { '__MIDNIGHT_CLOAK_PRODUCTION__': JSON.stringify(true) }
 * - esbuild: --define:__MIDNIGHT_CLOAK_PRODUCTION__=true
 *
 * When not replaced, falls back to checking common environment variables.
 */
declare const __MIDNIGHT_CLOAK_PRODUCTION__: boolean | undefined;

/**
 * Determine if we're running in a production environment.
 * Uses multiple detection methods for reliability across different bundlers.
 */
function detectProductionMode(): boolean {
  // 1. Build-time constant (most reliable - allows dead code elimination)
  if (typeof __MIDNIGHT_CLOAK_PRODUCTION__ !== 'undefined') {
    return __MIDNIGHT_CLOAK_PRODUCTION__;
  }

  // 2. Vite-style import.meta.env
  try {
    // @ts-expect-error - import.meta.env may not exist in all environments
    if (typeof import.meta?.env?.PROD === 'boolean') {
      // @ts-expect-error - accessing Vite's PROD flag
      return import.meta.env.PROD;
    }
  } catch {
    // import.meta not available
  }

  // 3. Node.js / bundler process.env
  if (typeof process !== 'undefined' && process.env) {
    const nodeEnv = process.env.NODE_ENV;
    if (nodeEnv === 'production') return true;
    if (nodeEnv === 'development' || nodeEnv === 'test') return false;
  }

  // 4. Default to false (development mode) for safety
  // This ensures mock features work during development
  return false;
}

/**
 * True if running in production mode.
 * Mock features and debug utilities are disabled when this is true.
 */
export const IS_PRODUCTION: boolean = detectProductionMode();

/**
 * True if running in development mode.
 */
export const IS_DEVELOPMENT: boolean = !IS_PRODUCTION;

/**
 * Assert that we're not in production mode.
 * Use this to guard development-only features.
 *
 * @throws Error if called in production
 */
export function assertNotProduction(feature: string): void {
  if (IS_PRODUCTION) {
    throw new Error(`${feature} is disabled in production builds`);
  }
}

/**
 * SDK version - updated during release
 */
export const SDK_VERSION = '0.1.0';

/**
 * Default timeout for verification operations (ms)
 */
export const DEFAULT_TIMEOUT_MS = 30000;

/**
 * Maximum allowed timeout (ms)
 */
export const MAX_TIMEOUT_MS = 300000; // 5 minutes
