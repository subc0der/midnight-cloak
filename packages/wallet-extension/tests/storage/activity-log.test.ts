import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ActivityLogStore, type ActivityEntry } from '../../src/shared/storage/activity-log';

// Mock chrome.storage.local
const mockStorage: Record<string, unknown> = {};
vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn((keys: string[]) => {
        const result: Record<string, unknown> = {};
        for (const key of keys) {
          if (key in mockStorage) {
            result[key] = mockStorage[key];
          }
        }
        return Promise.resolve(result);
      }),
      set: vi.fn((data: Record<string, unknown>) => {
        Object.assign(mockStorage, data);
        return Promise.resolve();
      }),
    },
  },
});

describe('ActivityLogStore', () => {
  beforeEach(() => {
    // Clear storage and reset singleton
    for (const key of Object.keys(mockStorage)) {
      delete mockStorage[key];
    }
    ActivityLogStore.resetInstance();
    vi.clearAllMocks();
  });

  describe('singleton pattern', () => {
    it('returns the same instance', () => {
      const instance1 = ActivityLogStore.getInstance();
      const instance2 = ActivityLogStore.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('creates new instance after reset', () => {
      const instance1 = ActivityLogStore.getInstance();
      ActivityLogStore.resetInstance();
      const instance2 = ActivityLogStore.getInstance();
      expect(instance1).not.toBe(instance2);
    });
  });

  describe('addEntry', () => {
    it('creates entry with generated UUID', async () => {
      const store = ActivityLogStore.getInstance();

      const id = await store.addEntry({
        type: 'verification_request',
        origin: 'https://example.com',
        credentialType: 'AGE',
      });

      expect(id).toBeDefined();
      expect(id).toMatch(/^[0-9a-f-]{36}$/); // UUID format
    });

    it('sets timestamp to current time', async () => {
      const store = ActivityLogStore.getInstance();
      const before = Date.now();

      await store.addEntry({
        type: 'approval',
        origin: 'https://example.com',
        credentialType: 'AGE',
      });

      const after = Date.now();
      const entries = await store.getAll();

      expect(entries[0].timestamp).toBeGreaterThanOrEqual(before);
      expect(entries[0].timestamp).toBeLessThanOrEqual(after);
    });

    it('stores metadata correctly', async () => {
      const store = ActivityLogStore.getInstance();

      await store.addEntry({
        type: 'verification_request',
        origin: 'https://example.com',
        credentialType: 'AGE',
        metadata: { requestId: 'req-123', minAge: 21 },
      });

      const entries = await store.getAll();
      expect(entries[0].metadata).toEqual({ requestId: 'req-123', minAge: 21 });
    });

    it('prunes oldest entries when over MAX_ENTRIES (100)', async () => {
      const store = ActivityLogStore.getInstance();

      // Add 105 entries sequentially (each will have a slightly different timestamp)
      for (let i = 0; i < 105; i++) {
        await store.addEntry({
          type: 'verification_request',
          origin: `https://example${i}.com`,
          credentialType: 'AGE',
        });
      }

      const entries = await store.getAll();

      // Should be capped at 100
      expect(entries.length).toBe(100);

      // The most recently added entry (example104) should definitely be present
      expect(entries.some((e) => e.origin === 'https://example104.com')).toBe(true);
    });
  });

  describe('getAll', () => {
    it('returns entries in descending timestamp order', async () => {
      const store = ActivityLogStore.getInstance();

      await store.addEntry({
        type: 'verification_request',
        origin: 'https://first.com',
        credentialType: 'AGE',
      });

      // Small delay to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 10));

      await store.addEntry({
        type: 'approval',
        origin: 'https://second.com',
        credentialType: 'AGE',
      });

      const entries = await store.getAll();

      expect(entries[0].origin).toBe('https://second.com');
      expect(entries[1].origin).toBe('https://first.com');
    });

    it('returns empty array when no entries', async () => {
      const store = ActivityLogStore.getInstance();
      const entries = await store.getAll();
      expect(entries).toEqual([]);
    });
  });

  describe('getByType', () => {
    it('filters entries by event type', async () => {
      const store = ActivityLogStore.getInstance();

      await store.addEntry({
        type: 'verification_request',
        origin: 'https://example.com',
        credentialType: 'AGE',
      });

      await store.addEntry({
        type: 'approval',
        origin: 'https://example.com',
        credentialType: 'AGE',
      });

      await store.addEntry({
        type: 'denial',
        origin: 'https://example.com',
        credentialType: 'AGE',
      });

      const approvals = await store.getByType('approval');
      expect(approvals.length).toBe(1);
      expect(approvals[0].type).toBe('approval');
    });

    it('returns empty array for type with no entries', async () => {
      const store = ActivityLogStore.getInstance();

      await store.addEntry({
        type: 'verification_request',
        origin: 'https://example.com',
        credentialType: 'AGE',
      });

      const denials = await store.getByType('denial');
      expect(denials).toEqual([]);
    });
  });

  describe('getByOrigin', () => {
    it('filters entries by origin', async () => {
      const store = ActivityLogStore.getInstance();

      await store.addEntry({
        type: 'verification_request',
        origin: 'https://example.com',
        credentialType: 'AGE',
      });

      await store.addEntry({
        type: 'verification_request',
        origin: 'https://other.com',
        credentialType: 'AGE',
      });

      const entries = await store.getByOrigin('https://example.com');
      expect(entries.length).toBe(1);
      expect(entries[0].origin).toBe('https://example.com');
    });
  });

  describe('getCounts', () => {
    it('returns count by event type', async () => {
      const store = ActivityLogStore.getInstance();

      await store.addEntry({
        type: 'verification_request',
        origin: 'https://example.com',
        credentialType: 'AGE',
      });

      await store.addEntry({
        type: 'verification_request',
        origin: 'https://example.com',
        credentialType: 'AGE',
      });

      await store.addEntry({
        type: 'approval',
        origin: 'https://example.com',
        credentialType: 'AGE',
      });

      const counts = await store.getCounts();
      expect(counts.verification_request).toBe(2);
      expect(counts.approval).toBe(1);
      expect(counts.denial).toBe(0);
    });
  });

  describe('clear', () => {
    it('removes all entries', async () => {
      const store = ActivityLogStore.getInstance();

      await store.addEntry({
        type: 'verification_request',
        origin: 'https://example.com',
        credentialType: 'AGE',
      });

      await store.addEntry({
        type: 'approval',
        origin: 'https://example.com',
        credentialType: 'AGE',
      });

      await store.clear();

      const entries = await store.getAll();
      expect(entries).toEqual([]);
    });
  });

  describe('getCount', () => {
    it('returns total entry count', async () => {
      const store = ActivityLogStore.getInstance();

      expect(await store.getCount()).toBe(0);

      await store.addEntry({
        type: 'verification_request',
        origin: 'https://example.com',
        credentialType: 'AGE',
      });

      expect(await store.getCount()).toBe(1);

      await store.addEntry({
        type: 'approval',
        origin: 'https://example.com',
        credentialType: 'AGE',
      });

      expect(await store.getCount()).toBe(2);
    });
  });

  describe('concurrent operations', () => {
    it('handles multiple concurrent adds without race conditions', async () => {
      const store = ActivityLogStore.getInstance();

      // Add 10 entries concurrently
      const promises = Array.from({ length: 10 }, (_, i) =>
        store.addEntry({
          type: 'verification_request',
          origin: `https://concurrent${i}.com`,
          credentialType: 'AGE',
        })
      );

      await Promise.all(promises);

      const entries = await store.getAll();
      expect(entries.length).toBe(10);
    });
  });

  describe('storage validation', () => {
    it('returns empty array when storage has invalid data', async () => {
      // Set invalid data
      mockStorage['activityLog'] = { invalid: 'data' };

      const store = ActivityLogStore.getInstance();
      const entries = await store.getAll();

      expect(entries).toEqual([]);
    });

    it('handles missing entries array gracefully', async () => {
      mockStorage['activityLog'] = { lastPruned: Date.now() };

      const store = ActivityLogStore.getInstance();
      const entries = await store.getAll();

      expect(entries).toEqual([]);
    });
  });

  describe('storage failure handling', () => {
    it('propagates error when storage.get fails', async () => {
      const store = ActivityLogStore.getInstance();

      // Mock storage failure
      vi.mocked(chrome.storage.local.get).mockRejectedValueOnce(
        new Error('Storage quota exceeded')
      );

      await expect(store.getAll()).rejects.toThrow('Storage quota exceeded');
    });

    it('propagates error when storage.set fails', async () => {
      const store = ActivityLogStore.getInstance();

      // Mock storage failure on set
      vi.mocked(chrome.storage.local.set).mockRejectedValueOnce(
        new Error('Storage quota exceeded')
      );

      await expect(
        store.addEntry({
          type: 'verification_request',
          origin: 'https://example.com',
          credentialType: 'AGE',
        })
      ).rejects.toThrow('Storage quota exceeded');
    });

    it('recovers after transient storage failure', async () => {
      const store = ActivityLogStore.getInstance();

      // First call fails
      vi.mocked(chrome.storage.local.get).mockRejectedValueOnce(
        new Error('Transient error')
      );

      await expect(store.getAll()).rejects.toThrow('Transient error');

      // Second call succeeds
      const entries = await store.getAll();
      expect(entries).toEqual([]);
    });
  });

  describe('context detection', () => {
    it('warns when instantiated outside background context', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Force non-background context
      ActivityLogStore.setBackgroundContext(false);
      ActivityLogStore.resetInstance();

      // Re-set to non-background before getInstance
      ActivityLogStore.setBackgroundContext(false);
      ActivityLogStore.getInstance();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Warning: Instantiated outside background script')
      );

      consoleSpy.mockRestore();
    });
  });
});
