/**
 * @maskid/core
 *
 * Core SDK for MaskID zero-knowledge identity verification on Midnight.
 *
 * @example Basic usage
 * ```typescript
 * import { MaskIDClient } from '@maskid/core';
 *
 * const client = new MaskIDClient({ network: 'testnet' });
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
 * import { MaskIDClient, WalletConnector } from '@maskid/core';
 *
 * const client = new MaskIDClient({ network: 'testnet' });
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
