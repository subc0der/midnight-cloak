import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProofGenerator, ProofGenerationError } from '../src/proof-generator';
import type { Credential, PolicyConfig } from '@midnight-cloak/core';

// Helper to create a valid credential
function createCredential(overrides: Partial<Credential> = {}): Credential {
  return {
    id: 'cred-123',
    type: 'AGE',
    issuer: 'mn_addr_preprod1issuer',
    subject: 'mn_addr_preprod1subject',
    claims: { birthYear: 1990 },
    issuedAt: Date.now(),
    expiresAt: Date.now() + 86400000,
    signature: new Uint8Array([1, 2, 3, 4, 5]),
    ...overrides,
  };
}

describe('ProofGenerator', () => {
  let generator: ProofGenerator;

  beforeEach(() => {
    generator = new ProofGenerator({
      proofServerUrl: 'http://localhost:6300',
    });
  });

  describe('constructor', () => {
    it('should require proofServerUrl', () => {
      expect(() => new ProofGenerator({ proofServerUrl: '' })).toThrow(ProofGenerationError);
      expect(() => new ProofGenerator({ proofServerUrl: '' })).toThrow('proofServerUrl is required');
    });

    it('should accept valid config', () => {
      const gen = new ProofGenerator({ proofServerUrl: 'http://localhost:6300' });
      expect(gen).toBeDefined();
    });
  });

  describe('generate()', () => {
    it('should generate proof for valid age request', async () => {
      const credential = createCredential({ type: 'AGE' });
      const policy: PolicyConfig = { kind: 'age', minAge: 18 };

      const proof = await generator.generate({
        credential,
        policy,
        nonce: 'unique-nonce-123',
      });

      expect(proof).toBeDefined();
      expect(proof.type).toBe('zk-snark');
      expect(proof.data).toBeInstanceOf(Uint8Array);
      expect(proof.data.length).toBe(256);
      expect(proof.publicInputs).toContain('unique-nonce-123');
      expect(proof.publicInputs).toContain('age');
      expect(proof.publicInputs).toContain(18);
    });

    it('should generate proof for token_balance request', async () => {
      const credential = createCredential({ type: 'TOKEN_BALANCE' });
      const policy: PolicyConfig = { kind: 'token_balance', token: 'NIGHT', minBalance: 1000 };

      const proof = await generator.generate({
        credential,
        policy,
        nonce: 'nonce-456',
      });

      expect(proof.publicInputs).toContain('token_balance');
      expect(proof.publicInputs).toContain('NIGHT');
      expect(proof.publicInputs).toContain(1000);
    });

    it('should generate proof for nft_ownership request', async () => {
      const credential = createCredential({ type: 'NFT_OWNERSHIP' });
      const policy: PolicyConfig = { kind: 'nft_ownership', collection: 'cool-nfts', minCount: 5 };

      const proof = await generator.generate({
        credential,
        policy,
        nonce: 'nonce-789',
      });

      expect(proof.publicInputs).toContain('nft_ownership');
      expect(proof.publicInputs).toContain('cool-nfts');
      expect(proof.publicInputs).toContain(5);
    });

    it('should reject request without credential', async () => {
      const policy: PolicyConfig = { kind: 'age', minAge: 18 };

      await expect(
        generator.generate({
          credential: undefined as unknown as Credential,
          policy,
          nonce: 'nonce',
        })
      ).rejects.toThrow('credential is required');
    });

    it('should reject request without policy', async () => {
      const credential = createCredential();

      await expect(
        generator.generate({
          credential,
          policy: undefined as unknown as PolicyConfig,
          nonce: 'nonce',
        })
      ).rejects.toThrow('policy is required');
    });

    it('should reject request without nonce', async () => {
      const credential = createCredential();
      const policy: PolicyConfig = { kind: 'age', minAge: 18 };

      await expect(
        generator.generate({
          credential,
          policy,
          nonce: '',
        })
      ).rejects.toThrow('nonce must be a non-empty string');
    });

    it('should reject request with policy missing kind', async () => {
      const credential = createCredential();
      const policy = { minAge: 18 } as unknown as PolicyConfig;

      await expect(
        generator.generate({
          credential,
          policy,
          nonce: 'nonce',
        })
      ).rejects.toThrow('policy must have a kind discriminant');
    });

    it('should reject expired credential', async () => {
      const credential = createCredential({ expiresAt: Date.now() - 1000 });
      const policy: PolicyConfig = { kind: 'age', minAge: 18 };

      await expect(
        generator.generate({
          credential,
          policy,
          nonce: 'nonce',
        })
      ).rejects.toThrow('Cannot generate proof for expired credential');
    });

    it('should allow credential with null expiresAt', async () => {
      const credential = createCredential({ expiresAt: null });
      const policy: PolicyConfig = { kind: 'age', minAge: 18 };

      const proof = await generator.generate({
        credential,
        policy,
        nonce: 'nonce',
      });

      expect(proof).toBeDefined();
    });

    it('should generate deterministic proof data based on request', async () => {
      const credential = createCredential({ id: 'deterministic-id' });
      const policy: PolicyConfig = { kind: 'age', minAge: 18 };
      const nonce = 'same-nonce';

      const proof1 = await generator.generate({ credential, policy, nonce });
      const proof2 = await generator.generate({ credential, policy, nonce });

      expect(Array.from(proof1.data)).toEqual(Array.from(proof2.data));
    });

    it('should generate different proof data for different nonces', async () => {
      const credential = createCredential();
      const policy: PolicyConfig = { kind: 'age', minAge: 18 };

      const proof1 = await generator.generate({ credential, policy, nonce: 'nonce-1' });
      const proof2 = await generator.generate({ credential, policy, nonce: 'nonce-2' });

      expect(Array.from(proof1.data)).not.toEqual(Array.from(proof2.data));
    });
  });

  describe('verify()', () => {
    it('should verify valid proof', async () => {
      const credential = createCredential();
      const policy: PolicyConfig = { kind: 'age', minAge: 18 };
      const proof = await generator.generate({ credential, policy, nonce: 'nonce' });

      const isValid = await generator.verify(proof);

      expect(isValid).toBe(true);
    });

    it('should reject proof with wrong type', async () => {
      const isValid = await generator.verify({
        type: 'invalid' as 'zk-snark',
        data: new Uint8Array([1, 2, 3]),
        publicInputs: ['nonce'],
      });

      expect(isValid).toBe(false);
    });

    it('should reject proof with empty data', async () => {
      const isValid = await generator.verify({
        type: 'zk-snark',
        data: new Uint8Array([]),
        publicInputs: ['nonce'],
      });

      expect(isValid).toBe(false);
    });

    it('should reject proof with invalid data type', async () => {
      const isValid = await generator.verify({
        type: 'zk-snark',
        data: 'not-uint8array' as unknown as Uint8Array,
        publicInputs: ['nonce'],
      });

      expect(isValid).toBe(false);
    });

    it('should reject proof with empty publicInputs', async () => {
      const isValid = await generator.verify({
        type: 'zk-snark',
        data: new Uint8Array([1, 2, 3]),
        publicInputs: [],
      });

      expect(isValid).toBe(false);
    });

    it('should reject null proof', async () => {
      const isValid = await generator.verify(null as unknown as ReturnType<typeof generator.generate> extends Promise<infer T> ? T : never);

      expect(isValid).toBe(false);
    });
  });

  describe('isServerAvailable()', () => {
    it('should return true when server responds OK', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: true });

      const available = await generator.isServerAvailable();

      expect(available).toBe(true);
      expect(fetch).toHaveBeenCalledWith('http://localhost:6300/health', expect.any(Object));
    });

    it('should return false when server responds with error', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: false });

      const available = await generator.isServerAvailable();

      expect(available).toBe(false);
    });

    it('should return false when fetch throws', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const available = await generator.isServerAvailable();

      expect(available).toBe(false);
    });

    it('should handle timeout', async () => {
      // Mock AbortController to immediately abort
      const abortError = new Error('Aborted');
      abortError.name = 'AbortError';

      global.fetch = vi.fn().mockRejectedValue(abortError);

      const available = await generator.isServerAvailable();

      // Should return false due to abort
      expect(available).toBe(false);
    });
  });
});
