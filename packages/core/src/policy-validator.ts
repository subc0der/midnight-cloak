/**
 * PolicyValidator - Centralized policy validation logic
 *
 * This module provides validation for all policy types, used by both
 * PolicyBuilder and Verifier to ensure consistent validation rules.
 */

import type { PolicyConfig, VerificationType, AgePolicy, TokenBalancePolicy, NFTOwnershipPolicy, ResidencyPolicy } from './types';
import { InvalidPolicyError } from './errors';

/**
 * Validation result containing validity status and any errors found.
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// ============================================================================
// Type Guards - Runtime type checking for user-provided policy objects
// ============================================================================

/**
 * Check if a value is a non-null object (not array, not null)
 */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Type guard for AgePolicy
 */
export function isAgePolicy(policy: unknown): policy is AgePolicy {
  return isObject(policy) && 'minAge' in policy;
}

/**
 * Type guard for TokenBalancePolicy
 */
export function isTokenBalancePolicy(policy: unknown): policy is TokenBalancePolicy {
  return isObject(policy) && 'token' in policy && 'minBalance' in policy;
}

/**
 * Type guard for NFTOwnershipPolicy
 */
export function isNFTOwnershipPolicy(policy: unknown): policy is NFTOwnershipPolicy {
  return isObject(policy) && 'collection' in policy;
}

/**
 * Type guard for ResidencyPolicy
 */
export function isResidencyPolicy(policy: unknown): policy is ResidencyPolicy {
  return isObject(policy) && 'country' in policy;
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validate an age policy configuration.
 */
function validateAgePolicy(policy: unknown): string[] {
  const errors: string[] = [];

  if (!isObject(policy)) {
    errors.push('AGE policy: must be an object');
    return errors;
  }

  if (!('minAge' in policy)) {
    errors.push('AGE policy: minAge is required');
    return errors;
  }

  const { minAge } = policy;

  if (typeof minAge !== 'number') {
    errors.push('AGE policy: minAge must be a number');
    return errors;
  }

  if (minAge < 0) {
    errors.push('AGE policy: minAge cannot be negative');
  }

  if (minAge > 150) {
    errors.push('AGE policy: minAge exceeds reasonable maximum (150)');
  }

  if (!Number.isInteger(minAge)) {
    errors.push('AGE policy: minAge must be an integer');
  }

  return errors;
}

/**
 * Validate a token balance policy configuration.
 */
function validateTokenBalancePolicy(policy: unknown): string[] {
  const errors: string[] = [];

  if (!isObject(policy)) {
    errors.push('TOKEN_BALANCE policy: must be an object');
    return errors;
  }

  const { token, minBalance } = policy;

  if (!token || typeof token !== 'string') {
    errors.push('TOKEN_BALANCE policy: token must be a non-empty string');
  }

  if (typeof minBalance !== 'number' || minBalance < 0) {
    errors.push('TOKEN_BALANCE policy: minBalance must be a non-negative number');
  }

  return errors;
}

/**
 * Validate an NFT ownership policy configuration.
 */
function validateNFTOwnershipPolicy(policy: unknown): string[] {
  const errors: string[] = [];

  if (!isObject(policy)) {
    errors.push('NFT_OWNERSHIP policy: must be an object');
    return errors;
  }

  const { collection, minCount } = policy;

  if (!collection || typeof collection !== 'string') {
    errors.push('NFT_OWNERSHIP policy: collection must be a non-empty string');
  }

  if (minCount !== undefined) {
    if (typeof minCount !== 'number' || minCount < 1) {
      errors.push('NFT_OWNERSHIP policy: minCount must be a positive number');
    }
  }

  return errors;
}

/**
 * Validate a residency policy configuration.
 */
function validateResidencyPolicy(policy: unknown): string[] {
  const errors: string[] = [];

  if (!isObject(policy)) {
    errors.push('RESIDENCY policy: must be an object');
    return errors;
  }

  const { country } = policy;

  if (!country || typeof country !== 'string') {
    errors.push('RESIDENCY policy: country must be a non-empty string');
  }

  return errors;
}

/**
 * Validate a policy configuration for a given verification type.
 *
 * @param type - The verification type
 * @param policy - The policy configuration to validate
 * @returns Validation result with any errors found
 *
 * @example
 * ```typescript
 * const result = validatePolicy('AGE', { minAge: 18 });
 * if (!result.valid) {
 *   console.error(result.errors);
 * }
 * ```
 */
export function validatePolicy(type: VerificationType | string, policy: unknown): ValidationResult {
  if (!policy) {
    return { valid: false, errors: ['Policy is required'] };
  }

  let errors: string[] = [];

  switch (type) {
    case 'AGE':
      errors = validateAgePolicy(policy);
      break;
    case 'TOKEN_BALANCE':
      errors = validateTokenBalancePolicy(policy);
      break;
    case 'NFT_OWNERSHIP':
      errors = validateNFTOwnershipPolicy(policy);
      break;
    case 'RESIDENCY':
      errors = validateResidencyPolicy(policy);
      break;
    // ACCREDITED and CREDENTIAL validation can be added when implemented
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate a policy and throw InvalidPolicyError if invalid.
 * Use this at entry points where invalid policies should halt execution.
 *
 * @param type - The verification type
 * @param policy - The policy configuration to validate
 * @throws InvalidPolicyError if the policy is invalid
 *
 * @example
 * ```typescript
 * // Throws if invalid
 * assertValidPolicy('AGE', request.policy);
 * // If we get here, policy is valid
 * ```
 */
export function assertValidPolicy(type: VerificationType | string, policy: unknown): void {
  const result = validatePolicy(type, policy);
  if (!result.valid) {
    throw new InvalidPolicyError(result.errors.join('; '));
  }
}

/**
 * Validate a PolicyConfig by inferring type from the kind discriminant.
 * Useful for validating policies without an explicit type parameter.
 *
 * @param policy - The policy configuration with kind discriminant
 * @returns Validation result with any errors found
 */
export function validatePolicyConfig(policy: PolicyConfig): ValidationResult {
  const typeMap: Record<string, VerificationType> = {
    age: 'AGE',
    token_balance: 'TOKEN_BALANCE',
    nft_ownership: 'NFT_OWNERSHIP',
    residency: 'RESIDENCY',
  };

  const verificationType = typeMap[policy.kind];
  if (!verificationType) {
    return { valid: false, errors: [`Unknown policy kind: ${policy.kind}`] };
  }

  return validatePolicy(verificationType, policy);
}
