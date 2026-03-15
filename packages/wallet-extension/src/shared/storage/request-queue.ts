/**
 * Persistent Request Queue for Midnight Cloak Extension
 *
 * Stores pending verification requests and credential offers in chrome.storage.local
 * to survive service worker dormancy. Chrome MV3 service workers can be terminated
 * after ~30 seconds of inactivity, losing all in-memory state.
 *
 * Design:
 * - Uses chrome.storage.local for persistence (survives SW restarts)
 * - Supports multiple concurrent requests (queue, not single variable)
 * - Auto-expires stale requests after TTL
 * - Stores completed responses for async pickup by content scripts
 *
 * @see https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle
 */

import type { ServiceUris } from '../../background/proof-generator';

// Storage key for the queue data
const STORAGE_KEY = 'requestQueue';

// Default TTL for pending requests (5 minutes - matches previous timeout)
const DEFAULT_TTL_MS = 5 * 60 * 1000;

// TTL for completed responses waiting for pickup (30 seconds)
const RESPONSE_TTL_MS = 30 * 1000;

/**
 * Persisted verification request with TTL and status tracking
 */
export interface PersistedVerificationRequest {
  id: string;
  origin: string;
  policyConfig: {
    type: string;
    minAge?: number;
    [key: string]: unknown;
  };
  /** Service URIs from Lace wallet (needed for proof generation after SW restart) */
  serviceUris?: ServiceUris;
  timestamp: number;
  /** When this request expires and should be cleaned up */
  expiresAt: number;
  /** Status to prevent duplicate processing */
  status: 'pending' | 'processing';
}

/**
 * Persisted credential offer with TTL and status tracking
 */
export interface PersistedCredentialOffer {
  id: string;
  origin: string;
  credential: {
    type: string;
    claims: Record<string, unknown>;
    issuer: string;
    expiresAt: number | null;
  };
  timestamp: number;
  expiresAt: number;
  status: 'pending' | 'processing';
}

/**
 * Completed response waiting for pickup by content script
 *
 * When a user approves/denies a request, the result is stored here.
 * The content script polls for the response using the requestId.
 */
export interface CompletedResponse {
  requestId: string;
  type: 'verification' | 'credential';
  result: unknown;
  completedAt: number;
  /** Auto-cleanup after this time */
  expiresAt: number;
}

/**
 * Full queue data structure stored in chrome.storage.local
 */
export interface RequestQueueData {
  pendingVerifications: PersistedVerificationRequest[];
  pendingOffers: PersistedCredentialOffer[];
  completedResponses: CompletedResponse[];
}

/**
 * Empty queue structure
 */
function emptyQueue(): RequestQueueData {
  return {
    pendingVerifications: [],
    pendingOffers: [],
    completedResponses: [],
  };
}

/**
 * Persistent request queue using chrome.storage.local
 *
 * Singleton pattern matching EncryptedStorage for consistency.
 * Uses a mutex lock to prevent race conditions when multiple
 * requests arrive simultaneously.
 */
export class RequestQueue {
  private static instance: RequestQueue | null = null;

  /**
   * Mutex lock to serialize storage operations.
   * Prevents race conditions when multiple requests arrive simultaneously.
   */
  private operationQueue: Promise<void> = Promise.resolve();

  /**
   * Get the singleton instance
   */
  static getInstance(): RequestQueue {
    if (!RequestQueue.instance) {
      RequestQueue.instance = new RequestQueue();
    }
    return RequestQueue.instance;
  }

  /**
   * Reset the singleton (for testing)
   */
  static resetInstance(): void {
    RequestQueue.instance = null;
  }

  // Private constructor for singleton
  private constructor() {}

  /**
   * Execute an operation with mutex lock to prevent race conditions.
   * Operations are queued and executed serially.
   */
  private async withLock<T>(operation: () => Promise<T>): Promise<T> {
    // Chain this operation after all pending operations
    const result = this.operationQueue.then(operation);

    // Update the queue to wait for this operation (ignore errors in chain)
    this.operationQueue = result.then(
      () => {},
      () => {}
    );

    return result;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Verification Requests
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Add a verification request to the queue
   * @returns The request ID
   */
  async addVerificationRequest(
    request: Omit<PersistedVerificationRequest, 'expiresAt' | 'status'>
  ): Promise<string> {
    return this.withLock(async () => {
      const data = await this.load();

      const persisted: PersistedVerificationRequest = {
        ...request,
        expiresAt: Date.now() + DEFAULT_TTL_MS,
        status: 'pending',
      };

      data.pendingVerifications.push(persisted);
      await this.save(data);

      console.log(`[RequestQueue] Added verification request ${request.id} from ${request.origin}`);
      return request.id;
    });
  }

  /**
   * Get a specific verification request by ID
   */
  async getVerificationRequest(id: string): Promise<PersistedVerificationRequest | null> {
    const data = await this.load();
    return data.pendingVerifications.find((r) => r.id === id) || null;
  }

  /**
   * Get all pending verification requests
   */
  async getAllPendingVerifications(): Promise<PersistedVerificationRequest[]> {
    const data = await this.load();
    return data.pendingVerifications.filter((r) => r.status === 'pending');
  }

  /**
   * Get the next pending verification request (FIFO order)
   */
  async getNextPendingVerification(): Promise<PersistedVerificationRequest | null> {
    const data = await this.load();
    return data.pendingVerifications.find((r) => r.status === 'pending') || null;
  }

  /**
   * Mark a verification request as processing (prevents duplicate handling)
   */
  async markVerificationProcessing(id: string): Promise<boolean> {
    return this.withLock(async () => {
      const data = await this.load();
      const request = data.pendingVerifications.find((r) => r.id === id);

      if (!request) {
        return false;
      }

      request.status = 'processing';
      await this.save(data);
      return true;
    });
  }

  /**
   * Remove a verification request from the queue
   */
  async removeVerificationRequest(id: string): Promise<boolean> {
    return this.withLock(async () => {
      const data = await this.load();
      const originalLength = data.pendingVerifications.length;

      data.pendingVerifications = data.pendingVerifications.filter((r) => r.id !== id);

      if (data.pendingVerifications.length < originalLength) {
        await this.save(data);
        console.log(`[RequestQueue] Removed verification request ${id}`);
        return true;
      }

      return false;
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Credential Offers
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Add a credential offer to the queue
   * @returns The offer ID
   */
  async addCredentialOffer(
    offer: Omit<PersistedCredentialOffer, 'expiresAt' | 'status'>
  ): Promise<string> {
    return this.withLock(async () => {
      const data = await this.load();

      const persisted: PersistedCredentialOffer = {
        ...offer,
        expiresAt: Date.now() + DEFAULT_TTL_MS,
        status: 'pending',
      };

      data.pendingOffers.push(persisted);
      await this.save(data);

      console.log(`[RequestQueue] Added credential offer ${offer.id} from ${offer.origin}`);
      return offer.id;
    });
  }

  /**
   * Get a specific credential offer by ID
   */
  async getCredentialOffer(id: string): Promise<PersistedCredentialOffer | null> {
    const data = await this.load();
    return data.pendingOffers.find((o) => o.id === id) || null;
  }

  /**
   * Get all pending credential offers
   */
  async getAllPendingOffers(): Promise<PersistedCredentialOffer[]> {
    const data = await this.load();
    return data.pendingOffers.filter((o) => o.status === 'pending');
  }

  /**
   * Get the next pending credential offer (FIFO order)
   */
  async getNextPendingOffer(): Promise<PersistedCredentialOffer | null> {
    const data = await this.load();
    return data.pendingOffers.find((o) => o.status === 'pending') || null;
  }

  /**
   * Mark a credential offer as processing
   */
  async markOfferProcessing(id: string): Promise<boolean> {
    return this.withLock(async () => {
      const data = await this.load();
      const offer = data.pendingOffers.find((o) => o.id === id);

      if (!offer) {
        return false;
      }

      offer.status = 'processing';
      await this.save(data);
      return true;
    });
  }

  /**
   * Remove a credential offer from the queue
   */
  async removeCredentialOffer(id: string): Promise<boolean> {
    return this.withLock(async () => {
      const data = await this.load();
      const originalLength = data.pendingOffers.length;

      data.pendingOffers = data.pendingOffers.filter((o) => o.id !== id);

      if (data.pendingOffers.length < originalLength) {
        await this.save(data);
        console.log(`[RequestQueue] Removed credential offer ${id}`);
        return true;
      }

      return false;
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Completed Responses
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Store a completed response for pickup by content script
   *
   * This is called when the user approves/denies a request.
   * The content script polls for the response using the requestId.
   */
  async completeRequest(
    requestId: string,
    type: 'verification' | 'credential',
    result: unknown
  ): Promise<void> {
    return this.withLock(async () => {
      const data = await this.load();

      // Remove from pending queue
      if (type === 'verification') {
        data.pendingVerifications = data.pendingVerifications.filter((r) => r.id !== requestId);
      } else {
        data.pendingOffers = data.pendingOffers.filter((o) => o.id !== requestId);
      }

      // Add to completed responses
      data.completedResponses.push({
        requestId,
        type,
        result,
        completedAt: Date.now(),
        expiresAt: Date.now() + RESPONSE_TTL_MS,
      });

      await this.save(data);
      console.log(`[RequestQueue] Completed ${type} request ${requestId}`);
    });
  }

  /**
   * Get a completed response by request ID
   *
   * Returns null if no response exists (request still pending or expired)
   */
  async getCompletedResponse(requestId: string): Promise<CompletedResponse | null> {
    const data = await this.load();
    return data.completedResponses.find((r) => r.requestId === requestId) || null;
  }

  /**
   * Remove a completed response after pickup
   *
   * Call this after the content script has retrieved the response.
   */
  async removeCompletedResponse(requestId: string): Promise<boolean> {
    return this.withLock(async () => {
      const data = await this.load();
      const originalLength = data.completedResponses.length;

      data.completedResponses = data.completedResponses.filter((r) => r.requestId !== requestId);

      if (data.completedResponses.length < originalLength) {
        await this.save(data);
        return true;
      }

      return false;
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Maintenance
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Clean up expired requests and responses
   *
   * Call this on service worker startup to remove stale entries.
   *
   * @returns Number of items cleaned
   */
  async cleanExpired(): Promise<number> {
    return this.withLock(async () => {
      const data = await this.load();
      const now = Date.now();

      const originalCount =
        data.pendingVerifications.length +
        data.pendingOffers.length +
        data.completedResponses.length;

      data.pendingVerifications = data.pendingVerifications.filter((r) => r.expiresAt > now);
      data.pendingOffers = data.pendingOffers.filter((o) => o.expiresAt > now);
      data.completedResponses = data.completedResponses.filter((r) => r.expiresAt > now);

      const newCount =
        data.pendingVerifications.length +
        data.pendingOffers.length +
        data.completedResponses.length;

      const cleaned = originalCount - newCount;

      if (cleaned > 0) {
        await this.save(data);
        console.log(`[RequestQueue] Cleaned ${cleaned} expired items`);
      }

      return cleaned;
    });
  }

  /**
   * Get counts of all queue items (for debugging/UI)
   */
  async getCounts(): Promise<{
    pendingVerifications: number;
    pendingOffers: number;
    completedResponses: number;
  }> {
    const data = await this.load();
    return {
      pendingVerifications: data.pendingVerifications.filter((r) => r.status === 'pending').length,
      pendingOffers: data.pendingOffers.filter((o) => o.status === 'pending').length,
      completedResponses: data.completedResponses.length,
    };
  }

  /**
   * Clear all queue data (for testing or reset)
   */
  async clear(): Promise<void> {
    return this.withLock(async () => {
      await this.save(emptyQueue());
      console.log('[RequestQueue] Cleared all queue data');
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Storage Operations
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Load queue data from chrome.storage.local
   */
  private async load(): Promise<RequestQueueData> {
    const result = await chrome.storage.local.get([STORAGE_KEY]);
    return result[STORAGE_KEY] || emptyQueue();
  }

  /**
   * Save queue data to chrome.storage.local
   */
  private async save(data: RequestQueueData): Promise<void> {
    await chrome.storage.local.set({ [STORAGE_KEY]: data });
  }
}
