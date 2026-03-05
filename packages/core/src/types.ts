/**
 * Core type definitions for Midnight Cloak SDK
 *
 * Updated to align with Midnight SDK patterns (midnight-js 3.0.0, wallet-sdk-facade 1.0.0)
 */

/**
 * Supported Midnight networks
 * - preprod: Public testnet (recommended for development)
 * - standalone: Fully local Docker environment
 * - mainnet: Production network (late March 2026)
 */
export type Network = 'preprod' | 'standalone' | 'mainnet';

/**
 * Supported wallet types for Midnight
 * Currently only Lace Midnight wallet is fully supported
 */
export type WalletType = 'lace' | 'nufi' | 'vespr';

/**
 * Types of verification that can be performed.
 * Each type corresponds to a different credential/attribute verification.
 *
 * - AGE: Verify user meets minimum age requirement
 * - TOKEN_BALANCE: Verify user holds minimum token balance
 * - NFT_OWNERSHIP: Verify user owns NFTs from a collection
 * - RESIDENCY: Verify user resides in a specific region
 * - ACCREDITED: Verify user is an accredited investor
 * - CREDENTIAL: Verify user has a generic verifiable credential
 */
export type VerificationType =
  | 'AGE'
  | 'TOKEN_BALANCE'
  | 'NFT_OWNERSHIP'
  | 'RESIDENCY'
  | 'ACCREDITED'
  | 'CREDENTIAL';

export interface ClientConfig {
  /**
   * Target network for verification
   */
  network: Network;

  /**
   * API key for metered billing (optional for development)
   */
  apiKey?: string;

  /**
   * Proof server URL (defaults to localhost:6300)
   */
  proofServerUrl?: string;

  /**
   * Request timeout in milliseconds (default: 30000)
   */
  timeout?: number;

  /**
   * Preferred wallet for connection (default: 'lace')
   */
  preferredWallet?: WalletType;

  /**
   * Path to compiled ZK circuit files
   */
  zkConfigPath?: string;
}

/**
 * Age verification policy
 * Requires the user to prove they meet a minimum age requirement
 */
export interface AgePolicy {
  /** Discriminant for type narrowing (optional for backward compatibility) */
  readonly kind?: 'age';
  /** Minimum age in years that the user must prove they meet */
  minAge: number;
}

/**
 * Token balance verification policy
 * Requires the user to prove they hold a minimum balance of a token
 */
export interface TokenBalancePolicy {
  /** Discriminant for type narrowing (optional for backward compatibility) */
  readonly kind?: 'token_balance';
  /** Token identifier (e.g., 'ADA', 'NIGHT', contract address) */
  token: string;
  /** Minimum balance required */
  minBalance: number;
}

/**
 * NFT ownership verification policy
 * Requires the user to prove ownership of NFTs from a collection
 */
export interface NFTOwnershipPolicy {
  /** Discriminant for type narrowing (optional for backward compatibility) */
  readonly kind?: 'nft_ownership';
  /** NFT collection identifier or policy ID */
  collection: string;
  /** Minimum number of NFTs required (default: 1) */
  minCount?: number;
}

/**
 * Residency verification policy
 * Requires the user to prove residency in a specific region
 */
export interface ResidencyPolicy {
  /** Discriminant for type narrowing (optional for backward compatibility) */
  readonly kind?: 'residency';
  /** ISO 3166-1 alpha-2 country code (e.g., 'US', 'GB') */
  country: string;
  /** Optional region/state code */
  region?: string;
}

/**
 * Discriminated union of all policy configuration types.
 * Use the `kind` property to narrow the type in conditionals.
 *
 * @example
 * ```typescript
 * function handlePolicy(policy: PolicyConfig) {
 *   switch (policy.kind) {
 *     case 'age':
 *       console.log(`Min age: ${policy.minAge}`);
 *       break;
 *     case 'token_balance':
 *       console.log(`Token: ${policy.token}, Min: ${policy.minBalance}`);
 *       break;
 *   }
 * }
 * ```
 */
export type PolicyConfig =
  | AgePolicy
  | TokenBalancePolicy
  | NFTOwnershipPolicy
  | ResidencyPolicy;

/**
 * Request parameters for initiating a verification.
 * Pass either `type` with `policy`, or `customPolicy` for complex requirements.
 *
 * @example
 * ```typescript
 * // Simple age verification
 * const request: VerificationRequest = {
 *   type: 'AGE',
 *   policy: { minAge: 18 }
 * };
 *
 * // With metadata for tracking
 * const request: VerificationRequest = {
 *   type: 'AGE',
 *   policy: { minAge: 21 },
 *   metadata: { purpose: 'alcohol-purchase' }
 * };
 * ```
 */
export interface VerificationRequest {
  /** Type of verification to perform */
  type?: VerificationType;
  /** Policy configuration for the verification type */
  policy?: PolicyConfig;
  /** Complex policy built with PolicyBuilder (alternative to type+policy) */
  customPolicy?: Policy;
  /** Optional key-value metadata attached to the request */
  metadata?: Record<string, string>;
  /** Custom timeout in milliseconds (overrides client default) */
  timeout?: number;
}

/**
 * Result of a verification attempt.
 * Check `verified` for success, `error` for failure details.
 *
 * @example
 * ```typescript
 * const result = await client.verify({ type: 'AGE', policy: { minAge: 18 } });
 * if (result.verified) {
 *   console.log('User verified with proof:', result.proof);
 * } else {
 *   console.error('Verification failed:', result.error?.message);
 * }
 * ```
 */
export interface VerificationResult {
  /** Whether the verification succeeded */
  verified: boolean;
  /** Unique identifier for this verification request */
  requestId: string;
  /** Unix timestamp (ms) when verification completed */
  timestamp: number;
  /** ZK proof if verification succeeded, null otherwise */
  proof: Proof | null;
  /** Error details if verification failed, null otherwise */
  error: VerificationError | null;
}

/**
 * Status of a verification request lifecycle.
 *
 * - pending: Request submitted, awaiting user action
 * - approved: User approved and proof verified
 * - denied: User rejected the verification request
 * - expired: Request timed out without response
 */
export type VerificationStatus = 'pending' | 'approved' | 'denied' | 'expired';

/**
 * Zero-knowledge proof generated during verification.
 * Contains the cryptographic proof data and public inputs.
 */
export interface Proof {
  /** Proof system used (currently only 'zk-snark' supported) */
  type: 'zk-snark';
  /** Raw proof bytes */
  data: Uint8Array;
  /** Public inputs/outputs visible to verifiers */
  publicInputs: unknown[];
  /** Optional verification key identifier */
  verificationKey?: string;
}

/**
 * Error information when a verification fails.
 * Use the `code` field for programmatic error handling.
 */
export interface VerificationError {
  /** Error code (e.g., 'E001' for wallet not connected) */
  code: string;
  /** Human-readable error message */
  message: string;
  /** Additional error context (varies by error type) */
  details?: unknown;
}

/**
 * Verifiable credential stored in the user's wallet.
 * Credentials are issued by trusted issuers and used to generate proofs.
 */
export interface Credential {
  /** Unique credential identifier (UUID) */
  id: string;
  /** Type of credential (matches verification types) */
  type: CredentialType;
  /** Midnight address of the credential issuer */
  issuer: string;
  /** Midnight address of the credential subject (user) */
  subject: string;
  /** Credential claims/attributes (e.g., { birthDate: '1990-01-15' }) */
  claims: Record<string, unknown>;
  /** Unix timestamp when credential was issued */
  issuedAt: number;
  /** Unix timestamp when credential expires, or null if non-expiring */
  expiresAt: number | null;
  /** Issuer's cryptographic signature over the credential */
  signature: Uint8Array;
}

/**
 * Credential type alias (matches verification types)
 */
export type CredentialType = VerificationType;

/**
 * Composite verification policy combining multiple conditions.
 * Built using PolicyBuilder for complex verification requirements.
 *
 * @example
 * ```typescript
 * const policy: Policy = {
 *   type: 'AND',
 *   conditions: [
 *     { type: 'AGE', params: { minAge: 21 } },
 *     { type: 'RESIDENCY', params: { country: 'US' } }
 *   ]
 * };
 * ```
 */
export interface Policy {
  /** How conditions are combined: AND (all), OR (any), SINGLE (one condition) */
  type: 'AND' | 'OR' | 'SINGLE';
  /** List of verification conditions */
  conditions: PolicyCondition[];
}

/**
 * Single condition within a composite policy.
 */
export interface PolicyCondition {
  /** Type of verification for this condition */
  type: VerificationType;
  /** Parameters for the verification type */
  params: PolicyConfig;
}
