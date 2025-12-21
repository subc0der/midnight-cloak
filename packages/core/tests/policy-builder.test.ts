import { describe, it, expect } from 'vitest';
import { PolicyBuilder } from '../src/policy-builder';
import { InvalidPolicyError } from '../src/errors';

describe('PolicyBuilder', () => {
  it('should build a simple age policy', () => {
    const policy = new PolicyBuilder().requireAge(18).build();

    expect(policy.type).toBe('SINGLE');
    expect(policy.conditions).toHaveLength(1);
    expect(policy.conditions[0]?.type).toBe('AGE');
    expect(policy.conditions[0]?.params).toEqual({ minAge: 18 });
  });

  it('should build an AND policy with multiple conditions', () => {
    const policy = new PolicyBuilder()
      .requireAge(21)
      .and()
      .requireTokenBalance('ADA', 1000)
      .build();

    expect(policy.type).toBe('AND');
    expect(policy.conditions).toHaveLength(2);
  });

  it('should build an OR policy', () => {
    const policy = new PolicyBuilder().requireAge(18).or().requireNFT('vip-collection').build();

    expect(policy.type).toBe('OR');
    expect(policy.conditions).toHaveLength(2);
  });

  it('should throw error for empty policy', () => {
    expect(() => new PolicyBuilder().build()).toThrow(InvalidPolicyError);
  });

  it('should reset builder state', () => {
    const builder = new PolicyBuilder().requireAge(18);
    builder.reset();

    expect(() => builder.build()).toThrow(InvalidPolicyError);
  });
});
