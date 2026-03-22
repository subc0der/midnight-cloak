/**
 * Tests for ChromeStorageAdapter
 *
 * Tests the adapter that wraps EncryptedStorage for credential management.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChromeStorageAdapter } from '../../src/shared/storage/chrome-storage-adapter';
import { EncryptedStorage } from '../../src/shared/storage/encrypted-storage';
import type { Credential } from '@midnight-cloak/core';

// Mock EncryptedStorage
vi.mock('../../src/shared/storage/encrypted-storage', () => ({
  EncryptedStorage: vi.fn().mockImplementation(() => ({
    load: vi.fn(),
    save: vi.fn(),
  })),
}));

describe('ChromeStorageAdapter', () => {
  let adapter: ChromeStorageAdapter;
  let mockStorage: {
    load: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
  };

  const mockCredential: Credential = {
    id: 'cred-1',
    type: 'AGE',
    issuer: 'a'.repeat(64),
    subject: 'b'.repeat(64),
    claims: { birthDate: '1990-01-01' },
    issuedAt: Date.now(),
    expiresAt: null,
    signature: new Uint8Array([1, 2, 3]),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockStorage = {
      load: vi.fn(),
      save: vi.fn(),
    };

    adapter = new ChromeStorageAdapter(mockStorage as unknown as EncryptedStorage);
  });

  describe('load', () => {
    it('returns empty array when storage has no data', async () => {
      mockStorage.load.mockResolvedValue(null);

      const result = await adapter.load();

      expect(result).toEqual([]);
    });

    it('returns empty array when storage has no credentials key', async () => {
      mockStorage.load.mockResolvedValue({});

      const result = await adapter.load();

      expect(result).toEqual([]);
    });

    it('returns credentials from storage', async () => {
      mockStorage.load.mockResolvedValue({
        credentials: [mockCredential],
      });

      const result = await adapter.load();

      expect(result).toEqual([mockCredential]);
    });

    it('returns multiple credentials', async () => {
      const secondCredential: Credential = {
        ...mockCredential,
        id: 'cred-2',
        type: 'TOKEN_BALANCE',
        claims: { token: 'ADA', balance: 1000 },
      };

      mockStorage.load.mockResolvedValue({
        credentials: [mockCredential, secondCredential],
      });

      const result = await adapter.load();

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('cred-1');
      expect(result[1].id).toBe('cred-2');
    });
  });

  describe('save', () => {
    it('saves credentials to storage', async () => {
      mockStorage.load.mockResolvedValue({ otherData: 'preserved' });
      mockStorage.save.mockResolvedValue(undefined);

      await adapter.save([mockCredential]);

      expect(mockStorage.save).toHaveBeenCalledWith({
        otherData: 'preserved',
        credentials: [mockCredential],
      });
    });

    it('preserves existing vault data when saving', async () => {
      mockStorage.load.mockResolvedValue({
        credentials: [],
        settings: { autoLock: 5 },
        metadata: { version: 1 },
      });
      mockStorage.save.mockResolvedValue(undefined);

      await adapter.save([mockCredential]);

      expect(mockStorage.save).toHaveBeenCalledWith({
        credentials: [mockCredential],
        settings: { autoLock: 5 },
        metadata: { version: 1 },
      });
    });

    it('creates credentials key when storage is empty', async () => {
      mockStorage.load.mockResolvedValue(null);
      mockStorage.save.mockResolvedValue(undefined);

      await adapter.save([mockCredential]);

      expect(mockStorage.save).toHaveBeenCalledWith({
        credentials: [mockCredential],
      });
    });

    it('saves empty array', async () => {
      mockStorage.load.mockResolvedValue({ credentials: [mockCredential] });
      mockStorage.save.mockResolvedValue(undefined);

      await adapter.save([]);

      expect(mockStorage.save).toHaveBeenCalledWith({
        credentials: [],
      });
    });
  });

  describe('clear', () => {
    it('clears credentials by saving empty array', async () => {
      mockStorage.save.mockResolvedValue(undefined);

      await adapter.clear();

      expect(mockStorage.save).toHaveBeenCalledWith({ credentials: [] });
    });
  });
});
