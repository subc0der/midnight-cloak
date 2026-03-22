/**
 * Tests for page-api.ts
 *
 * The page-api.ts script runs in page context and provides window.midnightCloak API.
 * These tests verify the API structure, message handling, and Lace wallet integration.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Store original window properties
const originalPostMessage = window.postMessage;
const originalAddEventListener = window.addEventListener;
const originalRemoveEventListener = window.removeEventListener;
const originalDispatchEvent = window.dispatchEvent;

// Mock implementations
let postMessageMock: ReturnType<typeof vi.fn>;
let messageHandlers: Array<(event: MessageEvent) => void> = [];
let dispatchEventMock: ReturnType<typeof vi.fn>;

// Mock window.midnight for Lace wallet detection
interface MockLaceWallet {
  name: string;
  apiVersion: string;
  icon: string;
  rdns: string;
  connect: ReturnType<typeof vi.fn>;
}

interface MockMidnightWindow {
  [uuid: string]: MockLaceWallet;
}

function createMockLaceWallet(overrides?: Partial<MockLaceWallet>): MockLaceWallet {
  return {
    name: 'lace',
    apiVersion: '1.0.0',
    icon: 'data:image/png;base64,mock',
    rdns: 'io.lace.midnight',
    connect: vi.fn().mockResolvedValue({
      getConfiguration: vi.fn().mockResolvedValue({
        networkId: 'preprod',
        proverServerUri: 'https://prover.example.com',
        indexerUri: 'https://indexer.example.com',
        indexerWsUri: 'wss://indexer.example.com',
        substrateNodeUri: 'wss://node.example.com',
      }),
    }),
    ...overrides,
  };
}

// Simulate response from content script
function simulateResponse(
  requestId: string,
  type: string,
  payload: Record<string, unknown>
): void {
  const responseEvent = new MessageEvent('message', {
    data: {
      source: 'midnight-cloak',
      type: `${type}_RESPONSE`,
      requestId,
      payload,
    },
    origin: window.location.origin,
  });

  // Call all registered message handlers
  messageHandlers.forEach((handler) => handler(responseEvent));
}

// Extract requestId from postMessage calls
function getLastRequestId(): string | undefined {
  const lastCall = postMessageMock.mock.calls[postMessageMock.mock.calls.length - 1];
  return lastCall?.[0]?.requestId;
}

describe('page-api', () => {
  beforeEach(() => {
    // Reset mocks
    postMessageMock = vi.fn();
    messageHandlers = [];
    dispatchEventMock = vi.fn();

    // Mock window methods
    window.postMessage = postMessageMock;
    window.addEventListener = vi.fn((type: string, handler: EventListener) => {
      if (type === 'message') {
        messageHandlers.push(handler as (event: MessageEvent) => void);
      }
    }) as typeof window.addEventListener;
    window.removeEventListener = vi.fn((type: string, handler: EventListener) => {
      if (type === 'message') {
        messageHandlers = messageHandlers.filter((h) => h !== handler);
      }
    }) as typeof window.removeEventListener;
    window.dispatchEvent = dispatchEventMock;

    // Clear window.midnight
    delete (window as { midnight?: MockMidnightWindow }).midnight;

    // Reset import cache to re-run the module
    vi.resetModules();
  });

  afterEach(() => {
    // Restore original window methods
    window.postMessage = originalPostMessage;
    window.addEventListener = originalAddEventListener;
    window.removeEventListener = originalRemoveEventListener;
    window.dispatchEvent = originalDispatchEvent;

    // Clean up window.midnightCloak
    delete (window as { midnightCloak?: unknown }).midnightCloak;
    delete (window as { midnight?: MockMidnightWindow }).midnight;
  });

  describe('API initialization', () => {
    it('creates window.midnightCloak with correct properties', async () => {
      await import('../../src/content/page-api');

      expect(window.midnightCloak).toBeDefined();
      expect(window.midnightCloak.isInstalled).toBe(true);
      expect(window.midnightCloak.version).toBe('0.1.0');
    });

    it('has all required methods', async () => {
      await import('../../src/content/page-api');

      expect(typeof window.midnightCloak.requestVerification).toBe('function');
      expect(typeof window.midnightCloak.getAvailableCredentials).toBe('function');
      expect(typeof window.midnightCloak.issueCredential).toBe('function');
      expect(typeof window.midnightCloak.isLaceAvailable).toBe('function');
      expect(typeof window.midnightCloak.getLaceServiceUris).toBe('function');
    });

    it('dispatches midnightCloakReady event on load', async () => {
      await import('../../src/content/page-api');

      expect(dispatchEventMock).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'midnightCloakReady',
        })
      );
    });
  });

  describe('isLaceAvailable()', () => {
    it('returns false when window.midnight is undefined', async () => {
      await import('../../src/content/page-api');

      expect(window.midnightCloak.isLaceAvailable()).toBe(false);
    });

    it('returns false when window.midnight is empty', async () => {
      (window as { midnight?: MockMidnightWindow }).midnight = {};
      await import('../../src/content/page-api');

      expect(window.midnightCloak.isLaceAvailable()).toBe(false);
    });

    it('returns true when Lace found by rdns', async () => {
      (window as { midnight?: MockMidnightWindow }).midnight = {
        'uuid-123': createMockLaceWallet(),
      };
      await import('../../src/content/page-api');

      expect(window.midnightCloak.isLaceAvailable()).toBe(true);
    });

    it('returns true when Lace found by name (fallback)', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      (window as { midnight?: MockMidnightWindow }).midnight = {
        'uuid-123': createMockLaceWallet({ rdns: 'other.wallet', name: 'lace' }),
      };
      await import('../../src/content/page-api');

      expect(window.midnightCloak.isLaceAvailable()).toBe(true);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Found Lace by name, not rdns')
      );

      consoleSpy.mockRestore();
    });

    it('returns false when no Lace wallet present', async () => {
      (window as { midnight?: MockMidnightWindow }).midnight = {
        'uuid-123': createMockLaceWallet({ rdns: 'other.wallet', name: 'other' }),
      };
      await import('../../src/content/page-api');

      expect(window.midnightCloak.isLaceAvailable()).toBe(false);
    });
  });

  describe('getLaceServiceUris()', () => {
    it('returns null when Lace is not available', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await import('../../src/content/page-api');

      const result = await window.midnightCloak.getLaceServiceUris();

      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Lace Midnight wallet not found')
      );

      consoleSpy.mockRestore();
    });

    it('returns configuration when Lace connects successfully', async () => {
      const mockConfig = {
        networkId: 'preprod',
        proverServerUri: 'https://prover.example.com',
        indexerUri: 'https://indexer.example.com',
        indexerWsUri: 'wss://indexer.example.com',
        substrateNodeUri: 'wss://node.example.com',
      };

      const mockWallet = createMockLaceWallet();
      mockWallet.connect.mockResolvedValue({
        getConfiguration: vi.fn().mockResolvedValue(mockConfig),
      });

      (window as { midnight?: MockMidnightWindow }).midnight = {
        'uuid-123': mockWallet,
      };

      vi.spyOn(console, 'log').mockImplementation(() => {});
      await import('../../src/content/page-api');

      const result = await window.midnightCloak.getLaceServiceUris();

      expect(result).toEqual(mockConfig);
      expect(mockWallet.connect).toHaveBeenCalledWith('preprod');
    });

    it('returns null on connection error', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(console, 'log').mockImplementation(() => {});

      const mockWallet = createMockLaceWallet();
      mockWallet.connect.mockRejectedValue(new Error('Connection refused'));

      (window as { midnight?: MockMidnightWindow }).midnight = {
        'uuid-123': mockWallet,
      };

      await import('../../src/content/page-api');

      const result = await window.midnightCloak.getLaceServiceUris();

      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to get Lace service URIs'),
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('requestVerification()', () => {
    beforeEach(async () => {
      vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      await import('../../src/content/page-api');
    });

    it('sends VERIFICATION_REQUEST message with policy config', async () => {
      const policy = { kind: 'age', minAge: 18 };

      // Start verification (don't await, we need to respond)
      const verifyPromise = window.midnightCloak.requestVerification(policy);

      // Wait for postMessage to be called
      await vi.waitFor(() => {
        expect(postMessageMock).toHaveBeenCalled();
      });

      const requestId = getLastRequestId();
      expect(requestId).toBeDefined();

      // Check message format
      expect(postMessageMock).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'VERIFICATION_REQUEST',
          source: 'midnight-cloak-dapp',
          requestId,
          payload: expect.objectContaining({
            policyConfig: policy,
          }),
        }),
        window.location.origin
      );

      // Simulate success response
      simulateResponse(requestId!, 'VERIFICATION_REQUEST', {
        success: true,
        verified: true,
        proof: 'mock-proof',
      });

      const result = await verifyPromise;
      expect(result).toEqual({
        success: true,
        verified: true,
        proof: 'mock-proof',
      });
    });

    it('includes serviceUris when Lace is available', async () => {
      const mockConfig = {
        networkId: 'preprod',
        proverServerUri: 'https://prover.example.com',
        indexerUri: 'https://indexer.example.com',
        indexerWsUri: 'wss://indexer.example.com',
        substrateNodeUri: 'wss://node.example.com',
      };

      const mockWallet = createMockLaceWallet();
      mockWallet.connect.mockResolvedValue({
        getConfiguration: vi.fn().mockResolvedValue(mockConfig),
      });

      (window as { midnight?: MockMidnightWindow }).midnight = {
        'uuid-123': mockWallet,
      };

      // Re-import to pick up the wallet
      vi.resetModules();
      await import('../../src/content/page-api');

      const policy = { kind: 'age', minAge: 21 };
      const verifyPromise = window.midnightCloak.requestVerification(policy);

      // Wait for postMessage
      await vi.waitFor(() => {
        expect(postMessageMock).toHaveBeenCalled();
      });

      const requestId = getLastRequestId();

      // Verify serviceUris included
      expect(postMessageMock).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            policyConfig: policy,
            serviceUris: mockConfig,
          }),
        }),
        window.location.origin
      );

      // Complete the request
      simulateResponse(requestId!, 'VERIFICATION_REQUEST', { success: true });
      await verifyPromise;
    });

    it('rejects on error response', async () => {
      const policy = { kind: 'age', minAge: 18 };
      const verifyPromise = window.midnightCloak.requestVerification(policy);

      await vi.waitFor(() => {
        expect(postMessageMock).toHaveBeenCalled();
      });

      const requestId = getLastRequestId();
      simulateResponse(requestId!, 'VERIFICATION_REQUEST', {
        success: false,
        error: 'User denied request',
      });

      await expect(verifyPromise).rejects.toThrow('User denied request');
    });

    it('rejects on timeout', async () => {
      vi.useFakeTimers();

      const policy = { kind: 'age', minAge: 18 };
      const verifyPromise = window.midnightCloak.requestVerification(policy);

      // Attach rejection handler before advancing time to prevent unhandled rejection
      let rejectionError: Error | null = null;
      verifyPromise.catch((err) => {
        rejectionError = err;
      });

      // Allow async operations (getLaceServiceUris) to complete, then advance past timeout
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 1000);

      // Verify the rejection occurred
      expect(rejectionError).toBeInstanceOf(Error);
      expect(rejectionError!.message).toContain('VERIFICATION_REQUEST timed out');

      vi.useRealTimers();
    });
  });

  describe('getAvailableCredentials()', () => {
    beforeEach(async () => {
      vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      await import('../../src/content/page-api');
    });

    it('sends GET_AVAILABLE_CREDENTIALS message', async () => {
      const credPromise = window.midnightCloak.getAvailableCredentials();

      await vi.waitFor(() => {
        expect(postMessageMock).toHaveBeenCalled();
      });

      const requestId = getLastRequestId();
      expect(postMessageMock).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'GET_AVAILABLE_CREDENTIALS',
          source: 'midnight-cloak-dapp',
          requestId,
        }),
        window.location.origin
      );

      simulateResponse(requestId!, 'GET_AVAILABLE_CREDENTIALS', {
        success: true,
        credentials: [
          { id: 'cred-1', type: 'AGE' },
          { id: 'cred-2', type: 'TOKEN_BALANCE' },
        ],
      });

      const result = await credPromise;
      expect(result).toEqual([
        { id: 'cred-1', type: 'AGE' },
        { id: 'cred-2', type: 'TOKEN_BALANCE' },
      ]);
    });

    it('returns empty array when no credentials', async () => {
      const credPromise = window.midnightCloak.getAvailableCredentials();

      await vi.waitFor(() => {
        expect(postMessageMock).toHaveBeenCalled();
      });

      const requestId = getLastRequestId();
      simulateResponse(requestId!, 'GET_AVAILABLE_CREDENTIALS', {
        success: true,
        credentials: [],
      });

      const result = await credPromise;
      expect(result).toEqual([]);
    });

    it('rejects on error', async () => {
      const credPromise = window.midnightCloak.getAvailableCredentials();

      await vi.waitFor(() => {
        expect(postMessageMock).toHaveBeenCalled();
      });

      const requestId = getLastRequestId();
      simulateResponse(requestId!, 'GET_AVAILABLE_CREDENTIALS', {
        success: false,
        error: 'Vault is locked',
      });

      await expect(credPromise).rejects.toThrow('Vault is locked');
    });
  });

  describe('issueCredential()', () => {
    beforeEach(async () => {
      vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      await import('../../src/content/page-api');
    });

    it('sends CREDENTIAL_OFFER message with credential data', async () => {
      const credential = {
        type: 'AGE',
        claims: { birthDate: '1990-01-15' },
        issuer: 'did:example:issuer',
        expiresAt: 1735689600000,
      };

      const issuePromise = window.midnightCloak.issueCredential(credential);

      await vi.waitFor(() => {
        expect(postMessageMock).toHaveBeenCalled();
      });

      const requestId = getLastRequestId();
      expect(postMessageMock).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'CREDENTIAL_OFFER',
          source: 'midnight-cloak-dapp',
          requestId,
          payload: {
            credential: {
              type: 'AGE',
              claims: { birthDate: '1990-01-15' },
              issuer: 'did:example:issuer',
              expiresAt: 1735689600000,
            },
          },
        }),
        window.location.origin
      );

      simulateResponse(requestId!, 'CREDENTIAL_OFFER', {
        success: true,
        credentialId: 'new-cred-id',
      });

      const result = await issuePromise;
      expect(result).toEqual({
        success: true,
        credentialId: 'new-cred-id',
      });
    });

    it('sets expiresAt to null when not provided', async () => {
      const credential = {
        type: 'AGE',
        claims: { birthDate: '1990-01-15' },
        issuer: 'did:example:issuer',
      };

      const issuePromise = window.midnightCloak.issueCredential(credential);

      await vi.waitFor(() => {
        expect(postMessageMock).toHaveBeenCalled();
      });

      const requestId = getLastRequestId();
      expect(postMessageMock).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: {
            credential: expect.objectContaining({
              expiresAt: null,
            }),
          },
        }),
        window.location.origin
      );

      simulateResponse(requestId!, 'CREDENTIAL_OFFER', { success: true });
      await issuePromise;
    });

    it('rejects when user denies', async () => {
      const credential = {
        type: 'AGE',
        claims: { birthDate: '1990-01-15' },
        issuer: 'did:example:issuer',
      };

      const issuePromise = window.midnightCloak.issueCredential(credential);

      await vi.waitFor(() => {
        expect(postMessageMock).toHaveBeenCalled();
      });

      const requestId = getLastRequestId();
      simulateResponse(requestId!, 'CREDENTIAL_OFFER', {
        success: false,
        error: 'User rejected credential',
      });

      await expect(issuePromise).rejects.toThrow('User rejected credential');
    });
  });

  describe('request correlation', () => {
    beforeEach(async () => {
      vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      await import('../../src/content/page-api');
    });

    it('generates unique request IDs', async () => {
      const requestIds: string[] = [];

      // Make multiple requests
      for (let i = 0; i < 3; i++) {
        const promise = window.midnightCloak.getAvailableCredentials();

        await vi.waitFor(() => {
          expect(postMessageMock.mock.calls.length).toBe(i + 1);
        });

        const requestId = getLastRequestId();
        requestIds.push(requestId!);

        // Complete the request
        simulateResponse(requestId!, 'GET_AVAILABLE_CREDENTIALS', {
          success: true,
          credentials: [],
        });

        await promise;
      }

      // All IDs should be unique
      const uniqueIds = new Set(requestIds);
      expect(uniqueIds.size).toBe(3);
    });

    it('ignores responses with non-matching requestId', async () => {
      const credPromise = window.midnightCloak.getAvailableCredentials();

      await vi.waitFor(() => {
        expect(postMessageMock).toHaveBeenCalled();
      });

      const correctRequestId = getLastRequestId();

      // Send response with wrong requestId - should be ignored
      simulateResponse('wrong-id', 'GET_AVAILABLE_CREDENTIALS', {
        success: true,
        credentials: [{ id: 'wrong' }],
      });

      // Promise should still be pending
      // Send correct response
      simulateResponse(correctRequestId!, 'GET_AVAILABLE_CREDENTIALS', {
        success: true,
        credentials: [{ id: 'correct' }],
      });

      const result = await credPromise;
      expect(result).toEqual([{ id: 'correct' }]);
    });

    it('ignores responses with wrong type', async () => {
      const credPromise = window.midnightCloak.getAvailableCredentials();

      await vi.waitFor(() => {
        expect(postMessageMock).toHaveBeenCalled();
      });

      const requestId = getLastRequestId();

      // Send response with wrong type - should be ignored
      simulateResponse(requestId!, 'VERIFICATION_REQUEST', {
        success: true,
        verified: true,
      });

      // Send correct response
      simulateResponse(requestId!, 'GET_AVAILABLE_CREDENTIALS', {
        success: true,
        credentials: [{ id: 'cred-1' }],
      });

      const result = await credPromise;
      expect(result).toEqual([{ id: 'cred-1' }]);
    });

    it('ignores responses from wrong source', async () => {
      const credPromise = window.midnightCloak.getAvailableCredentials();

      await vi.waitFor(() => {
        expect(postMessageMock).toHaveBeenCalled();
      });

      const requestId = getLastRequestId();

      // Send response with wrong source
      const wrongSourceEvent = new MessageEvent('message', {
        data: {
          source: 'malicious-extension',
          type: 'GET_AVAILABLE_CREDENTIALS_RESPONSE',
          requestId,
          payload: { success: true, credentials: [{ id: 'evil' }] },
        },
        origin: window.location.origin,
      });
      messageHandlers.forEach((handler) => handler(wrongSourceEvent));

      // Send correct response
      simulateResponse(requestId!, 'GET_AVAILABLE_CREDENTIALS', {
        success: true,
        credentials: [{ id: 'legit' }],
      });

      const result = await credPromise;
      expect(result).toEqual([{ id: 'legit' }]);
    });
  });

  describe('cleanup', () => {
    beforeEach(async () => {
      vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      await import('../../src/content/page-api');
    });

    it('removes message handler after successful response', async () => {
      const initialHandlerCount = messageHandlers.length;

      const credPromise = window.midnightCloak.getAvailableCredentials();

      await vi.waitFor(() => {
        expect(messageHandlers.length).toBe(initialHandlerCount + 1);
      });

      const requestId = getLastRequestId();
      simulateResponse(requestId!, 'GET_AVAILABLE_CREDENTIALS', {
        success: true,
        credentials: [],
      });

      await credPromise;

      // Handler should be removed
      expect(window.removeEventListener).toHaveBeenCalledWith('message', expect.any(Function));
    });

    it('removes message handler after error response', async () => {
      const credPromise = window.midnightCloak.getAvailableCredentials();

      await vi.waitFor(() => {
        expect(postMessageMock).toHaveBeenCalled();
      });

      const requestId = getLastRequestId();
      simulateResponse(requestId!, 'GET_AVAILABLE_CREDENTIALS', {
        success: false,
        error: 'Test error',
      });

      await expect(credPromise).rejects.toThrow();
      expect(window.removeEventListener).toHaveBeenCalled();
    });

    it('removes message handler after timeout', async () => {
      vi.useFakeTimers();

      const credPromise = window.midnightCloak.getAvailableCredentials();

      // Attach rejection handler before advancing time to prevent unhandled rejection
      let rejectionError: Error | null = null;
      credPromise.catch((err) => {
        rejectionError = err;
      });

      // Advance past timeout (30 seconds for getAvailableCredentials)
      await vi.advanceTimersByTimeAsync(31000);

      // Verify the rejection occurred and handler was removed
      expect(rejectionError).toBeInstanceOf(Error);
      expect(rejectionError!.message).toContain('timed out');
      expect(window.removeEventListener).toHaveBeenCalled();

      vi.useRealTimers();
    });
  });
});
