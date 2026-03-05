/**
 * @midnight-cloak/core
 *
 * Core SDK for Midnight Cloak zero-knowledge identity verification on Midnight.
 *
 * Built on midnight-js 3.0.0 and wallet-sdk-facade 1.0.0.
 *
 * @example Basic usage
 * ```typescript
 * import { MidnightCloakClient } from '@midnight-cloak/core';
 *
 * const client = new MidnightCloakClient({ network: 'preprod' });
 *
 * // Verify user is 18+
 * const result = await client.verify({
 *   type: 'AGE',
 *   policy: { kind: 'age', minAge: 18 }
 * });
 *
 * if (result.verified) {
 *   console.log('User verified!');
 * }
 * ```
 *
 * @example With wallet connection
 * ```typescript
 * import { MidnightCloakClient } from '@midnight-cloak/core';
 *
 * const client = new MidnightCloakClient({ network: 'preprod' });
 * await client.connectWallet('lace');
 *
 * const result = await client.verify({
 *   type: 'AGE',
 *   policy: { kind: 'age', minAge: 21 }
 * });
 * ```
 *
 * @example Using network configurations
 * ```typescript
 * import { MidnightCloakClient, PreprodConfig, StandaloneConfig } from '@midnight-cloak/core';
 *
 * // For testnet development
 * const preprodConfig = new PreprodConfig();
 *
 * // For local Docker development
 * const standaloneConfig = new StandaloneConfig();
 * ```
 *
 * @packageDocumentation
 */

// Types
export * from './types';

// Network configuration
export * from './config';

// Midnight providers
export * from './providers';

// Wallet provider integration
export * from './wallet-provider';

// Main client
export * from './client';

// Verification
export * from './verifier';
export * from './policy-builder';
export * from './policy-validator';

// Wallet integration (browser DApp connector)
export * from './wallet-connector';

// Contract interaction
export * from './contract-client';

// Error handling
export * from './errors';

// Constants and environment
export * from './constants';
