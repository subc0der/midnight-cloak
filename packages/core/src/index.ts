/**
 * @midnight-cloak/core
 *
 * Core SDK for Midnight Cloak zero-knowledge identity verification on Midnight.
 *
 * @example Basic usage
 * ```typescript
 * import { MidnightCloakClient } from '@midnight-cloak/core';
 *
 * const client = new MidnightCloakClient({ network: 'testnet' });
 *
 * // Verify user is 18+
 * const result = await client.verify({
 *   type: 'AGE',
 *   policy: { minAge: 18 }
 * });
 *
 * if (result.verified) {
 *   console.log('User verified!');
 * }
 * ```
 *
 * @example With wallet connection
 * ```typescript
 * import { MidnightCloakClient, WalletConnector } from '@midnight-cloak/core';
 *
 * const client = new MidnightCloakClient({ network: 'testnet' });
 * await client.connectWallet('lace');
 *
 * const result = await client.verify({
 *   type: 'AGE',
 *   policy: { minAge: 21 }
 * });
 * ```
 *
 * @packageDocumentation
 */

// Types
export * from './types';

// Main client
export * from './client';

// Verification
export * from './verifier';
export * from './policy-builder';

// Wallet integration
export * from './wallet-connector';

// Contract interaction (mock)
export * from './contract-client';

// Error handling
export * from './errors';
