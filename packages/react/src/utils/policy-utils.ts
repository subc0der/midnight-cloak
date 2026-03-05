/**
 * Shared policy utilities for React components
 *
 * Centralizes policy-related logic used by VerifyButton and CredentialGate
 * to prevent duplication and ensure consistent behavior.
 */

import type { VerificationType, PolicyConfig } from '@midnight-cloak/core';

/**
 * Verification requirement using convenience props.
 * Used by CredentialGate's `require` prop.
 */
export interface VerificationRequirement {
  /**
   * Type of verification to perform.
   * @deprecated Use `verificationType` instead.
   */
  type?: VerificationType;
  /** Type of verification to perform */
  verificationType?: VerificationType;
  /** Minimum age for AGE verification */
  minAge?: number;
  /** Token identifier for TOKEN_BALANCE verification */
  token?: string;
  /** Minimum balance for TOKEN_BALANCE verification */
  minBalance?: number;
  /** Collection ID for NFT_OWNERSHIP verification */
  collection?: string;
}

/**
 * Verification types that are not yet supported via convenience props.
 * These require using the `policy` prop directly.
 */
const UNSUPPORTED_CONVENIENCE_TYPES: VerificationType[] = [
  'RESIDENCY',
  'ACCREDITED',
  'CREDENTIAL',
];

/**
 * Infer VerificationType from PolicyConfig kind.
 *
 * @param policy - The policy configuration
 * @returns The corresponding VerificationType
 * @throws Error if the policy kind is unknown
 */
export function inferTypeFromPolicy(policy: PolicyConfig): VerificationType {
  switch (policy.kind) {
    case 'age':
      return 'AGE';
    case 'token_balance':
      return 'TOKEN_BALANCE';
    case 'nft_ownership':
      return 'NFT_OWNERSHIP';
    case 'residency':
      return 'RESIDENCY';
    default:
      throw new Error(`Unknown policy kind: ${(policy as { kind: string }).kind}`);
  }
}

/**
 * Build PolicyConfig from a VerificationType and convenience props.
 *
 * @param verifyType - The verification type
 * @param props - Convenience props (minAge, token, etc.)
 * @returns The constructed PolicyConfig
 * @throws Error if the verification type is unsupported via convenience props
 */
export function buildPolicyFromConvenienceProps(
  verifyType: VerificationType,
  props: {
    minAge?: number;
    token?: string;
    minBalance?: number;
    collection?: string;
  }
): PolicyConfig {
  // Check for unsupported types
  if (UNSUPPORTED_CONVENIENCE_TYPES.includes(verifyType)) {
    throw new Error(
      `${verifyType} verification requires using the policy prop directly. ` +
      `Example: policy={{ kind: '${verifyType.toLowerCase()}', ... }}`
    );
  }

  switch (verifyType) {
    case 'AGE':
      return { kind: 'age', minAge: props.minAge ?? 18 };
    case 'TOKEN_BALANCE':
      return { kind: 'token_balance', token: props.token ?? '', minBalance: props.minBalance ?? 0 };
    case 'NFT_OWNERSHIP':
      return { kind: 'nft_ownership', collection: props.collection ?? '' };
    default:
      throw new Error(`Unsupported verification type: ${verifyType}`);
  }
}

/**
 * Build PolicyConfig from VerificationRequirement convenience props.
 * Used by CredentialGate's `require` prop.
 *
 * @param require - The verification requirement object
 * @returns The constructed PolicyConfig
 * @throws Error if neither verificationType nor type is provided, or type is unsupported
 */
export function buildPolicyFromRequirement(require: VerificationRequirement): PolicyConfig {
  const verifyType = require.verificationType ?? require.type;

  if (!verifyType) {
    throw new Error('Either verificationType or type must be provided in require prop');
  }

  return buildPolicyFromConvenienceProps(verifyType, {
    minAge: require.minAge,
    token: require.token,
    minBalance: require.minBalance,
    collection: require.collection,
  });
}

/**
 * Generate a session key that includes policy parameters to prevent security bypass.
 * For example, a minAge:18 verification should not satisfy minAge:21.
 *
 * @param policy - The policy configuration
 * @returns A unique session storage key for this policy
 */
export function getSessionKey(policy: PolicyConfig): string {
  const parts = [`midnight-cloak:session:${policy.kind}`];

  switch (policy.kind) {
    case 'age':
      parts.push(`minAge:${policy.minAge}`);
      break;
    case 'token_balance':
      parts.push(`token:${policy.token}`, `minBalance:${policy.minBalance}`);
      break;
    case 'nft_ownership':
      parts.push(`collection:${policy.collection}`);
      if (policy.minCount !== undefined) {
        parts.push(`minCount:${policy.minCount}`);
      }
      break;
    case 'residency':
      parts.push(`country:${policy.country}`);
      if (policy.region !== undefined) {
        parts.push(`region:${policy.region}`);
      }
      break;
  }

  return parts.join(':');
}
