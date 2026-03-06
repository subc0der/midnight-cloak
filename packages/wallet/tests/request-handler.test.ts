import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RequestHandler, RequestHandlerError } from '../src/request-handler';
import type { VerificationRequest, Proof } from '@midnight-cloak/core';

describe('RequestHandler', () => {
  let handler: RequestHandler;

  beforeEach(() => {
    handler = new RequestHandler();
  });

  describe('constructor', () => {
    it('should initialize with default timeout', () => {
      const h = new RequestHandler();
      expect(h).toBeDefined();
    });

    it('should accept custom timeout', () => {
      const h = new RequestHandler({ timeout: 5000 });
      expect(h).toBeDefined();
    });
  });

  describe('onRequest()', () => {
    it('should register a callback', () => {
      const callback = vi.fn();

      handler.onRequest(callback);

      expect(handler.hasHandler()).toBe(true);
    });

    it('should return unregister function', () => {
      const callback = vi.fn();

      const unregister = handler.onRequest(callback);
      expect(handler.hasHandler()).toBe(true);

      unregister();
      expect(handler.hasHandler()).toBe(false);
    });

    it('should replace existing handler', () => {
      const callback1 = vi.fn().mockResolvedValue({ approved: true });
      const callback2 = vi.fn().mockResolvedValue({ approved: false });

      handler.onRequest(callback1);
      handler.onRequest(callback2);

      expect(handler.hasHandler()).toBe(true);
    });
  });

  describe('handleRequest()', () => {
    it('should call registered callback with request', async () => {
      const callback = vi.fn().mockResolvedValue({ approved: true });
      handler.onRequest(callback);

      const request: VerificationRequest = {
        type: 'AGE',
        policy: { kind: 'age', minAge: 18 },
      };

      await handler.handleRequest(request);

      expect(callback).toHaveBeenCalledWith(request);
    });

    it('should return callback response', async () => {
      const mockProof: Proof = {
        type: 'zk-snark',
        data: new Uint8Array([1, 2, 3]),
        publicInputs: ['nonce'],
      };

      const callback = vi.fn().mockResolvedValue({
        approved: true,
        proof: mockProof,
      });
      handler.onRequest(callback);

      const request: VerificationRequest = {
        type: 'AGE',
        policy: { kind: 'age', minAge: 18 },
      };

      const response = await handler.handleRequest(request);

      expect(response.approved).toBe(true);
      expect(response.proof).toBe(mockProof);
    });

    it('should throw when no handler registered', async () => {
      const request: VerificationRequest = {
        type: 'AGE',
        policy: { kind: 'age', minAge: 18 },
      };

      await expect(handler.handleRequest(request)).rejects.toThrow(RequestHandlerError);
      await expect(handler.handleRequest(request)).rejects.toThrow('No request handler registered');
    });

    it('should throw for invalid request - not an object', async () => {
      handler.onRequest(vi.fn());

      await expect(handler.handleRequest('invalid' as unknown as VerificationRequest)).rejects.toThrow(
        'Request must be an object'
      );
    });

    it('should throw for invalid request - missing type and customPolicy', async () => {
      handler.onRequest(vi.fn());

      await expect(handler.handleRequest({} as VerificationRequest)).rejects.toThrow(
        'Request must have either type+policy or customPolicy'
      );
    });

    it('should throw for invalid request - type without policy', async () => {
      handler.onRequest(vi.fn());

      await expect(
        handler.handleRequest({ type: 'AGE' } as unknown as VerificationRequest)
      ).rejects.toThrow('Request with type must also have policy');
    });

    it('should accept request with customPolicy', async () => {
      const callback = vi.fn().mockResolvedValue({ approved: true });
      handler.onRequest(callback);

      const request = {
        customPolicy: {
          rules: [{ type: 'age', minAge: 21 }],
        },
      } as unknown as VerificationRequest;

      await handler.handleRequest(request);

      expect(callback).toHaveBeenCalled();
    });

    it('should timeout long-running callbacks', async () => {
      const shortTimeoutHandler = new RequestHandler({ timeout: 100 });

      const slowCallback = vi.fn().mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ approved: true }), 500))
      );
      shortTimeoutHandler.onRequest(slowCallback);

      const request: VerificationRequest = {
        type: 'AGE',
        policy: { kind: 'age', minAge: 18 },
      };

      await expect(shortTimeoutHandler.handleRequest(request)).rejects.toThrow(RequestHandlerError);
      await expect(shortTimeoutHandler.handleRequest(request)).rejects.toThrow('Request timed out');
    });

    it('should not timeout fast callbacks', async () => {
      const callback = vi.fn().mockResolvedValue({ approved: true });
      handler.onRequest(callback);

      const request: VerificationRequest = {
        type: 'AGE',
        policy: { kind: 'age', minAge: 18 },
      };

      const response = await handler.handleRequest(request);

      expect(response.approved).toBe(true);
    });

    it('should propagate callback errors', async () => {
      const callback = vi.fn().mockRejectedValue(new Error('Callback failed'));
      handler.onRequest(callback);

      const request: VerificationRequest = {
        type: 'AGE',
        policy: { kind: 'age', minAge: 18 },
      };

      await expect(handler.handleRequest(request)).rejects.toThrow('Callback failed');
    });

    it('should handle denial response', async () => {
      const callback = vi.fn().mockResolvedValue({
        approved: false,
        error: 'User denied the request',
      });
      handler.onRequest(callback);

      const request: VerificationRequest = {
        type: 'AGE',
        policy: { kind: 'age', minAge: 18 },
      };

      const response = await handler.handleRequest(request);

      expect(response.approved).toBe(false);
      expect(response.error).toBe('User denied the request');
    });
  });

  describe('hasHandler()', () => {
    it('should return false when no handler', () => {
      expect(handler.hasHandler()).toBe(false);
    });

    it('should return true when handler registered', () => {
      handler.onRequest(vi.fn());
      expect(handler.hasHandler()).toBe(true);
    });

    it('should return false after removeHandler', () => {
      handler.onRequest(vi.fn());
      handler.removeHandler();
      expect(handler.hasHandler()).toBe(false);
    });
  });

  describe('removeHandler()', () => {
    it('should remove registered handler', () => {
      handler.onRequest(vi.fn());
      handler.removeHandler();

      expect(handler.hasHandler()).toBe(false);
    });

    it('should not throw when no handler', () => {
      expect(() => handler.removeHandler()).not.toThrow();
    });
  });
});
