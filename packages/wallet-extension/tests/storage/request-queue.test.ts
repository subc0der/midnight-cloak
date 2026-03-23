/**
 * Tests for RequestQueue
 *
 * Tests the persistent request queue for verification requests and credential offers.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RequestQueue } from '../../src/shared/storage/request-queue';
import { setMockStorage } from '../setup';

describe('RequestQueue', () => {
  let queue: RequestQueue;

  beforeEach(() => {
    RequestQueue.resetInstance();
    setMockStorage({});
    queue = RequestQueue.getInstance();
  });

  describe('singleton pattern', () => {
    it('returns the same instance', () => {
      const instance1 = RequestQueue.getInstance();
      const instance2 = RequestQueue.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('creates new instance after reset', () => {
      const instance1 = RequestQueue.getInstance();
      RequestQueue.resetInstance();
      const instance2 = RequestQueue.getInstance();
      expect(instance1).not.toBe(instance2);
    });
  });

  describe('verification requests', () => {
    const mockRequest = {
      id: 'req-123',
      origin: 'https://example.com',
      policyConfig: { type: 'AGE', minAge: 18 },
      timestamp: Date.now(),
    };

    it('adds a verification request', async () => {
      const id = await queue.addVerificationRequest(mockRequest);

      expect(id).toBe('req-123');
      const stored = await queue.getVerificationRequest('req-123');
      expect(stored).not.toBeNull();
      expect(stored?.origin).toBe('https://example.com');
      expect(stored?.status).toBe('pending');
    });

    it('sets expiration time on request', async () => {
      const beforeAdd = Date.now();
      await queue.addVerificationRequest(mockRequest);

      const stored = await queue.getVerificationRequest('req-123');
      expect(stored?.expiresAt).toBeGreaterThan(beforeAdd);
      // Default TTL is 5 minutes
      expect(stored?.expiresAt).toBeLessThanOrEqual(beforeAdd + 5 * 60 * 1000 + 100);
    });

    it('gets all pending verifications', async () => {
      await queue.addVerificationRequest({ ...mockRequest, id: 'req-1' });
      await queue.addVerificationRequest({ ...mockRequest, id: 'req-2' });
      await queue.addVerificationRequest({ ...mockRequest, id: 'req-3' });

      const pending = await queue.getAllPendingVerifications();
      expect(pending).toHaveLength(3);
    });

    it('gets next pending verification (FIFO)', async () => {
      await queue.addVerificationRequest({ ...mockRequest, id: 'req-1' });
      await queue.addVerificationRequest({ ...mockRequest, id: 'req-2' });

      const next = await queue.getNextPendingVerification();
      expect(next?.id).toBe('req-1');
    });

    it('marks request as processing', async () => {
      await queue.addVerificationRequest(mockRequest);

      const marked = await queue.markVerificationProcessing('req-123');
      expect(marked).toBe(true);

      const stored = await queue.getVerificationRequest('req-123');
      expect(stored?.status).toBe('processing');

      // Should not appear in pending list
      const pending = await queue.getAllPendingVerifications();
      expect(pending).toHaveLength(0);
    });

    it('returns false when marking non-existent request', async () => {
      const marked = await queue.markVerificationProcessing('non-existent');
      expect(marked).toBe(false);
    });

    it('removes verification request', async () => {
      await queue.addVerificationRequest(mockRequest);

      const removed = await queue.removeVerificationRequest('req-123');
      expect(removed).toBe(true);

      const stored = await queue.getVerificationRequest('req-123');
      expect(stored).toBeNull();
    });

    it('returns false when removing non-existent request', async () => {
      const removed = await queue.removeVerificationRequest('non-existent');
      expect(removed).toBe(false);
    });

    it('returns null for non-existent request', async () => {
      const stored = await queue.getVerificationRequest('non-existent');
      expect(stored).toBeNull();
    });
  });

  describe('credential offers', () => {
    const mockOffer = {
      id: 'offer-123',
      origin: 'https://issuer.com',
      credential: {
        type: 'AGE',
        claims: { birthDate: '1990-01-01' },
        issuer: 'a'.repeat(64),
        expiresAt: null,
      },
      timestamp: Date.now(),
    };

    it('adds a credential offer', async () => {
      const id = await queue.addCredentialOffer(mockOffer);

      expect(id).toBe('offer-123');
      const stored = await queue.getCredentialOffer('offer-123');
      expect(stored).not.toBeNull();
      expect(stored?.origin).toBe('https://issuer.com');
      expect(stored?.status).toBe('pending');
    });

    it('gets all pending offers', async () => {
      await queue.addCredentialOffer({ ...mockOffer, id: 'offer-1' });
      await queue.addCredentialOffer({ ...mockOffer, id: 'offer-2' });

      const pending = await queue.getAllPendingOffers();
      expect(pending).toHaveLength(2);
    });

    it('gets next pending offer (FIFO)', async () => {
      await queue.addCredentialOffer({ ...mockOffer, id: 'offer-1' });
      await queue.addCredentialOffer({ ...mockOffer, id: 'offer-2' });

      const next = await queue.getNextPendingOffer();
      expect(next?.id).toBe('offer-1');
    });

    it('marks offer as processing', async () => {
      await queue.addCredentialOffer(mockOffer);

      const marked = await queue.markOfferProcessing('offer-123');
      expect(marked).toBe(true);

      const stored = await queue.getCredentialOffer('offer-123');
      expect(stored?.status).toBe('processing');
    });

    it('removes credential offer', async () => {
      await queue.addCredentialOffer(mockOffer);

      const removed = await queue.removeCredentialOffer('offer-123');
      expect(removed).toBe(true);

      const stored = await queue.getCredentialOffer('offer-123');
      expect(stored).toBeNull();
    });
  });

  describe('completed responses', () => {
    const mockRequest = {
      id: 'req-123',
      origin: 'https://example.com',
      policyConfig: { type: 'AGE', minAge: 18 },
      timestamp: Date.now(),
    };

    it('stores completed verification response', async () => {
      await queue.addVerificationRequest(mockRequest);

      await queue.completeRequest('req-123', 'verification', {
        verified: true,
        proof: 'mock-proof',
      });

      const response = await queue.getCompletedResponse('req-123');
      expect(response).not.toBeNull();
      expect(response?.type).toBe('verification');
      expect(response?.result).toEqual({ verified: true, proof: 'mock-proof' });
    });

    it('removes request from pending when completing', async () => {
      await queue.addVerificationRequest(mockRequest);

      await queue.completeRequest('req-123', 'verification', { verified: true });

      const pending = await queue.getAllPendingVerifications();
      expect(pending).toHaveLength(0);
    });

    it('removes completed response after pickup', async () => {
      await queue.addVerificationRequest(mockRequest);
      await queue.completeRequest('req-123', 'verification', { verified: true });

      const removed = await queue.removeCompletedResponse('req-123');
      expect(removed).toBe(true);

      const response = await queue.getCompletedResponse('req-123');
      expect(response).toBeNull();
    });

    it('returns null for non-existent response', async () => {
      const response = await queue.getCompletedResponse('non-existent');
      expect(response).toBeNull();
    });
  });

  describe('expiration and cleanup', () => {
    it('cleans expired requests', async () => {
      // Mock Date.now to create expired items
      const now = Date.now();

      // Add items with past expiration
      vi.spyOn(Date, 'now').mockReturnValue(now - 10 * 60 * 1000); // 10 min ago
      await queue.addVerificationRequest({
        id: 'expired-req',
        origin: 'https://example.com',
        policyConfig: { type: 'AGE' },
        timestamp: now - 10 * 60 * 1000,
      });

      // Restore time to "now"
      vi.spyOn(Date, 'now').mockReturnValue(now);

      const cleaned = await queue.cleanExpired();
      expect(cleaned).toBe(1);

      const stored = await queue.getVerificationRequest('expired-req');
      expect(stored).toBeNull();
    });

    it('keeps non-expired requests', async () => {
      await queue.addVerificationRequest({
        id: 'fresh-req',
        origin: 'https://example.com',
        policyConfig: { type: 'AGE' },
        timestamp: Date.now(),
      });

      const cleaned = await queue.cleanExpired();
      expect(cleaned).toBe(0);

      const stored = await queue.getVerificationRequest('fresh-req');
      expect(stored).not.toBeNull();
    });
  });

  describe('counts', () => {
    it('returns correct counts', async () => {
      await queue.addVerificationRequest({
        id: 'req-1',
        origin: 'https://example.com',
        policyConfig: { type: 'AGE' },
        timestamp: Date.now(),
      });
      await queue.addVerificationRequest({
        id: 'req-2',
        origin: 'https://example.com',
        policyConfig: { type: 'AGE' },
        timestamp: Date.now(),
      });
      await queue.addCredentialOffer({
        id: 'offer-1',
        origin: 'https://issuer.com',
        credential: { type: 'AGE', claims: {}, issuer: 'a'.repeat(64), expiresAt: null },
        timestamp: Date.now(),
      });

      // Mark one as processing (should not count as pending)
      await queue.markVerificationProcessing('req-1');

      const counts = await queue.getCounts();
      expect(counts.pendingVerifications).toBe(1);
      expect(counts.pendingOffers).toBe(1);
      expect(counts.completedResponses).toBe(0);
    });
  });

  describe('clear', () => {
    it('removes all queue data', async () => {
      await queue.addVerificationRequest({
        id: 'req-1',
        origin: 'https://example.com',
        policyConfig: { type: 'AGE' },
        timestamp: Date.now(),
      });
      await queue.addCredentialOffer({
        id: 'offer-1',
        origin: 'https://issuer.com',
        credential: { type: 'AGE', claims: {}, issuer: 'a'.repeat(64), expiresAt: null },
        timestamp: Date.now(),
      });

      await queue.clear();

      const counts = await queue.getCounts();
      expect(counts.pendingVerifications).toBe(0);
      expect(counts.pendingOffers).toBe(0);
      expect(counts.completedResponses).toBe(0);
    });
  });

  describe('concurrent operations', () => {
    it('handles multiple concurrent adds without race conditions', async () => {
      // Add 10 requests concurrently
      const promises = Array.from({ length: 10 }, (_, i) =>
        queue.addVerificationRequest({
          id: `concurrent-${i}`,
          origin: 'https://example.com',
          policyConfig: { type: 'AGE' },
          timestamp: Date.now(),
        })
      );

      await Promise.all(promises);

      const pending = await queue.getAllPendingVerifications();
      expect(pending).toHaveLength(10);
    });
  });
});
