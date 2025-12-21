/**
 * PolicyBuilder - Fluent API for building complex verification policies
 */

import type { Policy, PolicyCondition, VerificationType } from './types';
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

  requireCredential(type: VerificationType, params: Record<string, unknown>): this {
    this.conditions.push({
      type,
      params: params as PolicyCondition['params'],
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

  build(): Policy {
    if (this.conditions.length === 0) {
      throw new InvalidPolicyError('Policy must have at least one condition');
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
