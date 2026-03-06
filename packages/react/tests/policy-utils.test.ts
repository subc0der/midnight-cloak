import { describe, it, expect } from 'vitest';
import {
  inferTypeFromPolicy,
  buildPolicyFromConvenienceProps,
  buildPolicyFromRequirement,
  getSessionKey,
} from '../src/utils/policy-utils';
import type { PolicyConfig } from '@midnight-cloak/core';

describe('policy-utils', () => {
  describe('inferTypeFromPolicy()', () => {
    it('should return AGE for age policy', () => {
      const policy: PolicyConfig = { kind: 'age', minAge: 18 };
      expect(inferTypeFromPolicy(policy)).toBe('AGE');
    });

    it('should return TOKEN_BALANCE for token_balance policy', () => {
      const policy: PolicyConfig = { kind: 'token_balance', token: 'NIGHT', minBalance: 100 };
      expect(inferTypeFromPolicy(policy)).toBe('TOKEN_BALANCE');
    });

    it('should return NFT_OWNERSHIP for nft_ownership policy', () => {
      const policy: PolicyConfig = { kind: 'nft_ownership', collection: 'cool-nfts' };
      expect(inferTypeFromPolicy(policy)).toBe('NFT_OWNERSHIP');
    });

    it('should return RESIDENCY for residency policy', () => {
      const policy: PolicyConfig = { kind: 'residency', country: 'US' };
      expect(inferTypeFromPolicy(policy)).toBe('RESIDENCY');
    });

    it('should throw for unknown policy kind', () => {
      const policy = { kind: 'unknown' } as unknown as PolicyConfig;
      expect(() => inferTypeFromPolicy(policy)).toThrow('Unknown policy kind: unknown');
    });
  });

  describe('buildPolicyFromConvenienceProps()', () => {
    describe('AGE type', () => {
      it('should build age policy with minAge', () => {
        const policy = buildPolicyFromConvenienceProps('AGE', { minAge: 21 });
        expect(policy).toEqual({ kind: 'age', minAge: 21 });
      });

      it('should default minAge to 18', () => {
        const policy = buildPolicyFromConvenienceProps('AGE', {});
        expect(policy).toEqual({ kind: 'age', minAge: 18 });
      });
    });

    describe('TOKEN_BALANCE type', () => {
      it('should build token_balance policy', () => {
        const policy = buildPolicyFromConvenienceProps('TOKEN_BALANCE', {
          token: 'NIGHT',
          minBalance: 1000,
        });
        expect(policy).toEqual({ kind: 'token_balance', token: 'NIGHT', minBalance: 1000 });
      });

      it('should default token to empty string and minBalance to 0', () => {
        const policy = buildPolicyFromConvenienceProps('TOKEN_BALANCE', {});
        expect(policy).toEqual({ kind: 'token_balance', token: '', minBalance: 0 });
      });
    });

    describe('NFT_OWNERSHIP type', () => {
      it('should build nft_ownership policy', () => {
        const policy = buildPolicyFromConvenienceProps('NFT_OWNERSHIP', {
          collection: 'cool-nfts',
        });
        expect(policy).toEqual({ kind: 'nft_ownership', collection: 'cool-nfts' });
      });

      it('should default collection to empty string', () => {
        const policy = buildPolicyFromConvenienceProps('NFT_OWNERSHIP', {});
        expect(policy).toEqual({ kind: 'nft_ownership', collection: '' });
      });
    });

    describe('unsupported types', () => {
      it('should throw for RESIDENCY', () => {
        expect(() => buildPolicyFromConvenienceProps('RESIDENCY', {})).toThrow(
          'RESIDENCY verification requires using the policy prop directly'
        );
      });

      it('should throw for ACCREDITED', () => {
        expect(() => buildPolicyFromConvenienceProps('ACCREDITED', {})).toThrow(
          'ACCREDITED verification requires using the policy prop directly'
        );
      });

      it('should throw for CREDENTIAL', () => {
        expect(() => buildPolicyFromConvenienceProps('CREDENTIAL', {})).toThrow(
          'CREDENTIAL verification requires using the policy prop directly'
        );
      });
    });
  });

  describe('buildPolicyFromRequirement()', () => {
    it('should build policy from verificationType', () => {
      const policy = buildPolicyFromRequirement({
        verificationType: 'AGE',
        minAge: 25,
      });
      expect(policy).toEqual({ kind: 'age', minAge: 25 });
    });

    it('should support deprecated type prop', () => {
      const policy = buildPolicyFromRequirement({
        type: 'AGE',
        minAge: 21,
      });
      expect(policy).toEqual({ kind: 'age', minAge: 21 });
    });

    it('should prefer verificationType over type', () => {
      const policy = buildPolicyFromRequirement({
        verificationType: 'AGE',
        type: 'TOKEN_BALANCE',
        minAge: 18,
      });
      expect(policy.kind).toBe('age');
    });

    it('should throw when neither verificationType nor type provided', () => {
      expect(() => buildPolicyFromRequirement({ minAge: 18 })).toThrow(
        'Either verificationType or type must be provided'
      );
    });

    it('should pass through token props', () => {
      const policy = buildPolicyFromRequirement({
        verificationType: 'TOKEN_BALANCE',
        token: 'DUST',
        minBalance: 500,
      });
      expect(policy).toEqual({ kind: 'token_balance', token: 'DUST', minBalance: 500 });
    });
  });

  describe('getSessionKey()', () => {
    describe('age policy', () => {
      it('should include kind and minAge', () => {
        const key = getSessionKey({ kind: 'age', minAge: 18 });
        expect(key).toBe('midnight-cloak:session:age:minAge:18');
      });

      it('should generate different keys for different minAge', () => {
        const key18 = getSessionKey({ kind: 'age', minAge: 18 });
        const key21 = getSessionKey({ kind: 'age', minAge: 21 });
        expect(key18).not.toBe(key21);
      });
    });

    describe('token_balance policy', () => {
      it('should include kind, token, and minBalance', () => {
        const key = getSessionKey({ kind: 'token_balance', token: 'NIGHT', minBalance: 1000 });
        expect(key).toBe('midnight-cloak:session:token_balance:token:NIGHT:minBalance:1000');
      });
    });

    describe('nft_ownership policy', () => {
      it('should include kind and collection', () => {
        const key = getSessionKey({ kind: 'nft_ownership', collection: 'cool-nfts' });
        expect(key).toBe('midnight-cloak:session:nft_ownership:collection:cool-nfts');
      });

      it('should include minCount when present', () => {
        const key = getSessionKey({ kind: 'nft_ownership', collection: 'cool-nfts', minCount: 5 });
        expect(key).toBe('midnight-cloak:session:nft_ownership:collection:cool-nfts:minCount:5');
      });
    });

    describe('residency policy', () => {
      it('should include kind and country', () => {
        const key = getSessionKey({ kind: 'residency', country: 'US' });
        expect(key).toBe('midnight-cloak:session:residency:country:US');
      });

      it('should include region when present', () => {
        const key = getSessionKey({ kind: 'residency', country: 'US', region: 'CA' });
        expect(key).toBe('midnight-cloak:session:residency:country:US:region:CA');
      });
    });

    it('should generate consistent keys for same policy', () => {
      const policy: PolicyConfig = { kind: 'age', minAge: 21 };
      const key1 = getSessionKey(policy);
      const key2 = getSessionKey(policy);
      expect(key1).toBe(key2);
    });
  });
});
