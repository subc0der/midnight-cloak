/**
 * PolicyBuilder - Fluent API for building complex verification policies
 */

import type { Policy, PolicyCondition, PolicyConfig, VerificationType } from './types';
import { InvalidPolicyError } from './errors';

export class PolicyBuilder {
  private conditions: PolicyCondition[] = [];
  private combinator: 'AND' | 'OR' = 'AND';

  requireAge(minAge: number): this {
    this.conditions.push({
      type: 'AGE',
      params: { minAge },
    });
    return this;
  }

  requireTokenBalance(token: string, minBalance: number): this {
    this.conditions.push({
      type: 'TOKEN_BALANCE',
      params: { token, minBalance },
    });
    return this;
  }

  requireNFT(collection: string, minCount = 1): this {
    this.conditions.push({
      type: 'NFT_OWNERSHIP',
      params: { collection, minCount },
    });
    return this;
  }

  requireResidency(country: string, region?: string): this {
    this.conditions.push({
      type: 'RESIDENCY',
      params: { country, region },
    });
    return this;
  }

  requireCredential(type: VerificationType, params: PolicyConfig): this {
    this.conditions.push({
      type,
      params,
    });
    return this;
  }

  and(): this {
    this.combinator = 'AND';
    return this;
  }

  or(): this {
    this.combinator = 'OR';
    return this;
  }

  /**
   * Validate the current policy configuration without building.
   * Returns validation result with any errors found.
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
  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (this.conditions.length === 0) {
      errors.push('Policy must have at least one condition');
    }

    for (const condition of this.conditions) {
      const conditionErrors = this.validateCondition(condition);
      errors.push(...conditionErrors);
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Validate a single policy condition
   */
  private validateCondition(condition: PolicyCondition): string[] {
    const errors: string[] = [];

    switch (condition.type) {
      case 'AGE': {
        const params = condition.params as { minAge?: number };
        if (typeof params.minAge !== 'number' || params.minAge < 0) {
          errors.push('AGE policy: minAge must be a non-negative number');
        }
        if (params.minAge !== undefined && params.minAge > 150) {
          errors.push('AGE policy: minAge exceeds reasonable maximum (150)');
        }
        break;
      }
      case 'TOKEN_BALANCE': {
        const params = condition.params as { token?: string; minBalance?: number };
        if (!params.token || typeof params.token !== 'string') {
          errors.push('TOKEN_BALANCE policy: token must be a non-empty string');
        }
        if (typeof params.minBalance !== 'number' || params.minBalance < 0) {
          errors.push('TOKEN_BALANCE policy: minBalance must be a non-negative number');
        }
        break;
      }
      case 'NFT_OWNERSHIP': {
        const params = condition.params as { collection?: string; minCount?: number };
        if (!params.collection || typeof params.collection !== 'string') {
          errors.push('NFT_OWNERSHIP policy: collection must be a non-empty string');
        }
        if (params.minCount !== undefined && (typeof params.minCount !== 'number' || params.minCount < 1)) {
          errors.push('NFT_OWNERSHIP policy: minCount must be a positive number');
        }
        break;
      }
      case 'RESIDENCY': {
        const params = condition.params as { country?: string };
        if (!params.country || typeof params.country !== 'string') {
          errors.push('RESIDENCY policy: country must be a non-empty string');
        }
        break;
      }
    }

    return errors;
  }

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
