/**
 * Tests for ProofGenerator
 *
 * Tests ZK proof generation logic and mock fallback behavior.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ProofGenerator, getProofGenerator, type ServiceUris, type AgeProofInput } from '../../src/background/proof-generator';

// Mock chrome APIs needed by ProofGenerator
const mockChrome = {
  runtime: {
    getContexts: vi.fn(() => Promise.resolve([])),
    sendMessage: vi.fn(),
    ContextType: {
      OFFSCREEN_DOCUMENT: 'OFFSCREEN_DOCUMENT',
    },
  },
  offscreen: {
    createDocument: vi.fn(() => Promise.resolve()),
    Reason: {
      WORKERS: 'WORKERS',
    },
  },
};

// @ts-expect-error - Chrome types not available in test environment
globalThis.chrome = mockChrome;

describe('ProofGenerator', () => {
  let generator: ProofGenerator;

  const mockServiceUris: ServiceUris = {
    networkId: 'preprod',
    proverServerUri: 'https://prover.example.com',
    indexerUri: 'https://indexer.example.com',
    indexerWsUri: 'wss://indexer.example.com',
    substrateNodeUri: 'wss://node.example.com',
  };

  const mockAgeInput: AgeProofInput = {
    birthYear: 1990,
    minAge: 18,
    currentYear: 2024,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    generator = new ProofGenerator();
  });

  afterEach(() => {
    // Clean up singleton to prevent cross-test state contamination
    const singleton = getProofGenerator();
    singleton.disconnect();
  });

  describe('initialization', () => {
    it('starts uninitialized', () => {
      expect(generator.isInitialized()).toBe(false);
      expect(generator.getProverServerUri()).toBeNull();
    });

    it('stores service URIs on initialize', async () => {
      await generator.initialize(mockServiceUris);

      expect(generator.isInitialized()).toBe(true);
      expect(generator.getProverServerUri()).toBe('https://prover.example.com');
    });

    it('clears service URIs on disconnect', async () => {
      await generator.initialize(mockServiceUris);
      expect(generator.isInitialized()).toBe(true);

      generator.disconnect();

      expect(generator.isInitialized()).toBe(false);
      expect(generator.getProverServerUri()).toBeNull();
    });
  });

  describe('configuration', () => {
    it('defaults to mock proofs disabled', () => {
      // By default, mock proofs should be disabled for security
      expect(generator.isInitialized()).toBe(false);
    });

    it('logs warning when mock proofs enabled', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      generator.configure({ allowMockProofs: true });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Mock proofs enabled')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('generateAgeProof', () => {
    describe('without service URIs', () => {
      it('throws error when mock proofs disabled and no service URIs', async () => {
        generator.configure({ allowMockProofs: false });

        await expect(generator.generateAgeProof(mockAgeInput)).rejects.toThrow(
          'ZK proof generation unavailable: No service URIs'
        );
      });

      it('returns mock proof when mock proofs enabled and no service URIs', async () => {
        generator.configure({ allowMockProofs: true });

        const result = await generator.generateAgeProof(mockAgeInput);

        expect(result.isMock).toBe(true);
        expect(result.isVerified).toBe(true); // 2024 - 1990 = 34 >= 18
        expect(result.proof).toBeInstanceOf(Uint8Array);
        expect(result.proof.length).toBe(64);
        expect(result.publicOutputs).toEqual([true, 18, 2024]);
      });

      it('returns mock proof with isVerified=false when age insufficient', async () => {
        generator.configure({ allowMockProofs: true });

        const youngInput: AgeProofInput = {
          birthYear: 2010,
          minAge: 18,
          currentYear: 2024,
        };

        const result = await generator.generateAgeProof(youngInput);

        expect(result.isMock).toBe(true);
        expect(result.isVerified).toBe(false); // 2024 - 2010 = 14 < 18
        expect(result.publicOutputs).toEqual([false, 18, 2024]);
      });
    });

    describe('with service URIs', () => {
      beforeEach(async () => {
        await generator.initialize(mockServiceUris);
      });

      it('creates offscreen document if not exists', async () => {
        mockChrome.runtime.getContexts.mockResolvedValue([]);
        mockChrome.runtime.sendMessage.mockResolvedValue({
          success: true,
          proof: Array.from(new Uint8Array(64)),
          isVerified: true,
          isMock: false,
        });

        await generator.generateAgeProof(mockAgeInput);

        expect(mockChrome.offscreen.createDocument).toHaveBeenCalledWith({
          url: 'offscreen.html',
          reasons: [mockChrome.offscreen.Reason.WORKERS],
          justification: expect.stringContaining('Midnight SDK'),
        });
      });

      it('skips offscreen creation if already exists', async () => {
        mockChrome.runtime.getContexts.mockResolvedValue([{ contextType: 'OFFSCREEN_DOCUMENT' }]);
        mockChrome.runtime.sendMessage.mockResolvedValue({
          success: true,
          proof: Array.from(new Uint8Array(64)),
          isVerified: true,
          isMock: false,
        });

        await generator.generateAgeProof(mockAgeInput);

        expect(mockChrome.offscreen.createDocument).not.toHaveBeenCalled();
      });

      it('sends proof request to offscreen document', async () => {
        mockChrome.runtime.getContexts.mockResolvedValue([]);
        mockChrome.runtime.sendMessage.mockResolvedValue({
          success: true,
          proof: Array.from(new Uint8Array(64)),
          isVerified: true,
          isMock: false,
        });

        await generator.generateAgeProof(mockAgeInput);

        expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith({
          type: 'GENERATE_AGE_PROOF',
          serviceUris: mockServiceUris,
          birthYear: 1990,
          minAge: 18,
          currentYear: 2024,
        });
      });

      it('returns proof from offscreen document', async () => {
        const mockProofBytes = new Uint8Array(64);
        crypto.getRandomValues(mockProofBytes);

        mockChrome.runtime.getContexts.mockResolvedValue([]);
        mockChrome.runtime.sendMessage.mockResolvedValue({
          success: true,
          proof: Array.from(mockProofBytes),
          isVerified: true,
          isMock: false,
        });

        const result = await generator.generateAgeProof(mockAgeInput);

        expect(result.isMock).toBe(false);
        expect(result.isVerified).toBe(true);
        expect(result.proof).toEqual(mockProofBytes);
        expect(result.publicOutputs).toEqual([true, 18, 2024]);
      });

      it('throws error when offscreen returns failure and mock disabled', async () => {
        generator.configure({ allowMockProofs: false });
        mockChrome.runtime.getContexts.mockResolvedValue([]);
        mockChrome.runtime.sendMessage.mockResolvedValue({
          success: false,
          error: 'SDK initialization failed',
        });

        await expect(generator.generateAgeProof(mockAgeInput)).rejects.toThrow(
          'ZK proof generation failed: SDK initialization failed'
        );
      });

      it('falls back to mock when offscreen fails and mock enabled', async () => {
        generator.configure({ allowMockProofs: true });
        mockChrome.runtime.getContexts.mockResolvedValue([]);
        mockChrome.runtime.sendMessage.mockResolvedValue({
          success: false,
          error: 'SDK initialization failed',
        });

        const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const result = await generator.generateAgeProof(mockAgeInput);

        expect(result.isMock).toBe(true);
        expect(result.isVerified).toBe(true);
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('Falling back to mock proof')
        );

        consoleSpy.mockRestore();
      });

      it('handles offscreen document creation failure', async () => {
        generator.configure({ allowMockProofs: false });
        mockChrome.runtime.getContexts.mockResolvedValue([]);
        mockChrome.offscreen.createDocument.mockRejectedValue(new Error('Cannot create offscreen'));

        await expect(generator.generateAgeProof(mockAgeInput)).rejects.toThrow(
          'ZK proof generation failed'
        );
      });
    });
  });

  describe('singleton', () => {
    it('getProofGenerator returns same instance', () => {
      const instance1 = getProofGenerator();
      const instance2 = getProofGenerator();

      expect(instance1).toBe(instance2);
    });
  });
});
