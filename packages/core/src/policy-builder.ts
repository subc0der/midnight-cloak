/**
 * PolicyBuilder - Fluent API for building complex verification policies
 */

import type { Policy, PolicyCondition, PolicyConfig, VerificationType } from './types';
import { InvalidPolicyError } from './errors';
import { validatePolicy, type ValidationResult } from './policy-validator';

export class PolicyBuilder {
  private conditions: PolicyCondition[] = [];
  private combinator: 'AND' | 'OR' = 'AND';

  /**
   * Require minimum age verification.
   *
   * @example
   * ```typescript
   * new PolicyBuilder().requireAge(18).build()
   * ```
   */
  requireAge(minAge: number): this {
    this.conditions.push({
      type: 'AGE',
      params: { kind: 'age', minAge },
    });
    return this;
  }

  /**
   * Require minimum token balance verification.
   *
   * @example
   * ```typescript
   * new PolicyBuilder().requireTokenBalance('ADA', 1000).build()
   * ```
   */
  requireTokenBalance(token: string, minBalance: number): this {
    this.conditions.push({
      type: 'TOKEN_BALANCE',
      params: { kind: 'token_balance', token, minBalance },
    });
    return this;
  }

  /**
   * Require NFT ownership verification.
   *
   * @example
   * ```typescript
   * new PolicyBuilder().requireNFT('collection_policy_id', 1).build()
   * ```
   */
  requireNFT(collection: string, minCount = 1): this {
    this.conditions.push({
      type: 'NFT_OWNERSHIP',
      params: { kind: 'nft_ownership', collection, minCount },
    });
    return this;
  }

  /**
   * Require residency verification.
   *
   * @example
   * ```typescript
   * new PolicyBuilder().requireResidency('US', 'CA').build()
   * ```
   */
  requireResidency(country: string, region?: string): this {
    this.conditions.push({
      type: 'RESIDENCY',
      params: { kind: 'residency', country, region },
    });
    return this;
  }

  /**
   * Require a generic credential verification.
   */
  requireCredential(type: VerificationType, params: PolicyConfig): this {
    this.conditions.push({
      type,
      params,
    });
    return this;
  }

  /**
   * Combine conditions with AND (all must pass).
   */
  and(): this {
    this.combinator = 'AND';
    return this;
  }

  /**
   * Combine conditions with OR (any must pass).
   */
  or(): this {
    this.combinator = 'OR';
    return this;
  }

  /**
   * Validate the current policy configuration without building.
   * Uses centralized validation logic shared with Verifier.
   *
   * @example
   * ```typescript
   * const builder = new PolicyBuilder().requireAge(-5);
   * const result = builder.validate();
   * if (!result.valid) {
   *   console.error(result.errors);
   * }
   * ```
   */
  validate(): ValidationResult {
    const errors: string[] = [];

    if (this.conditions.length === 0) {
      errors.push('Policy must have at least one condition');
    }

    for (const condition of this.conditions) {
      const result = validatePolicy(condition.type, condition.params);
      errors.push(...result.errors);
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Build the policy object. Throws if validation fails.
   */
  build(): Policy {
    const validation = this.validate();
    if (!validation.valid) {
      throw new InvalidPolicyError(validation.errors.join('; '));
    }

    if (this.conditions.length === 1) {
      return {
        type: 'SINGLE',
        conditions: this.conditions,
      };
    }

    return {
      type: this.combinator,
      conditions: this.conditions,
    };
  }

  reset(): this {
    this.conditions = [];
    this.combinator = 'AND';
    return this;
  }
}
