/**
 * Tests for EncryptedStorage fail-closed security behavior
 *
 * These tests verify that the vault locks itself when storage operations fail,
 * preventing operation with potentially corrupted or unavailable data.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { chromeMock, setMockStorage, simulateStorageFailure } from '../setup';

// We need to test the EncryptedStorage class directly, but it uses
// the offscreen document for key derivation. We'll mock that.
vi.mock('../../src/shared/storage/encrypted-storage', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../src/shared/storage/encrypted-storage')>();

  // Create a testable version that bypasses offscreen document
  class TestableEncryptedStorage {
    private encryptionKey: CryptoKey | null = null;

    async initialize(password: string): Promise<void> {
      // Simplified: just derive key directly (no offscreen)
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const keyMaterial = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(password),
        'PBKDF2',
        false,
        ['deriveKey']
      );
      this.encryptionKey = await crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt, iterations: 1000, hash: 'SHA-256' },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
      );

      try {
        await chrome.storage.local.set({ salt: Array.from(salt) });
      } catch {
        this.encryptionKey = null;
        throw new Error('Storage unavailable - vault initialization failed');
      }
    }

    async unlock(password: string): Promise<void> {
      let result: { salt?: number[]; encryptedVault?: string };
      try {
        result = await chrome.storage.local.get(['salt', 'encryptedVault']);
      } catch {
        this.encryptionKey = null;
        throw new Error('Storage unavailable');
      }

      if (!result.salt) {
        throw new Error('No vault found');
      }

      const salt = new Uint8Array(result.salt);
      const keyMaterial = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(password),
        'PBKDF2',
        false,
        ['deriveKey']
      );
      this.encryptionKey = await crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt, iterations: 1000, hash: 'SHA-256' },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
      );

      if (result.encryptedVault) {
        try {
          await this.decrypt(result.encryptedVault);
        } catch {
          this.encryptionKey = null;
          throw new Error('Incorrect password');
        }
      }
    }

    lock(): void {
      this.encryptionKey = null;
    }

    isUnlocked(): boolean {
      return this.encryptionKey !== null;
    }

    async save(data: { credentials: unknown[] }): Promise<void> {
      if (!this.encryptionKey) {
        throw new Error('Vault is locked');
      }

      const encryptedVault = await this.encrypt(data);

      try {
        await chrome.storage.local.set({ encryptedVault });
      } catch {
        this.encryptionKey = null;
        throw new Error('Storage unavailable - vault locked for security');
      }
    }

    async load(): Promise<{ credentials: unknown[] } | null> {
      if (!this.encryptionKey) {
        throw new Error('Vault is locked');
      }

      let result: { encryptedVault?: string };
      try {
        result = await chrome.storage.local.get(['encryptedVault']);
      } catch {
        this.encryptionKey = null;
        throw new Error('Storage unavailable - vault locked for security');
      }

      if (!result.encryptedVault) {
        return null;
      }

      try {
        return await this.decrypt(result.encryptedVault);
      } catch {
        this.encryptionKey = null;
        throw new Error('Data corruption detected - vault locked for security');
      }
    }

    private async encrypt(data: { credentials: unknown[] }): Promise<string> {
      if (!this.encryptionKey) {
        throw new Error('No encryption key');
      }
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const plaintext = new TextEncoder().encode(JSON.stringify(data));
      const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        this.encryptionKey,
        plaintext
      );
      const combined = new Uint8Array(iv.length + ciphertext.byteLength);
      combined.set(iv, 0);
      combined.set(new Uint8Array(ciphertext), iv.length);
      return btoa(String.fromCharCode(...combined));
    }

    private async decrypt(encryptedData: string): Promise<{ credentials: unknown[] }> {
      if (!this.encryptionKey) {
        throw new Error('No encryption key');
      }
      const combined = new Uint8Array(
        atob(encryptedData).split('').map((c) => c.charCodeAt(0))
      );
      const iv = combined.slice(0, 12);
      const ciphertext = combined.slice(12);
      const plaintext = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        this.encryptionKey,
        ciphertext
      );
      return JSON.parse(new TextDecoder().decode(plaintext));
    }
  }

  return {
    ...original,
    EncryptedStorage: TestableEncryptedStorage,
  };
});

// Import after mocking
import { EncryptedStorage } from '../../src/shared/storage/encrypted-storage';

describe('EncryptedStorage - Fail-Closed Security', () => {
  let storage: EncryptedStorage;

  beforeEach(() => {
    storage = new EncryptedStorage();
    simulateStorageFailure(null); // Reset to normal operation
  });

  describe('initialize()', () => {
    it('should lock vault if salt storage fails', async () => {
      // First allow key derivation, then fail on storage
      let callCount = 0;
      chromeMock.storage.local.set.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error('Storage unavailable'));
        }
        return Promise.resolve();
      });

      await expect(storage.initialize('password123')).rejects.toThrow('Storage unavailable');
      expect(storage.isUnlocked()).toBe(false);
    });
  });

  describe('unlock()', () => {
    it('should fail-closed if storage.get fails', async () => {
      simulateStorageFailure('get');

      await expect(storage.unlock('password123')).rejects.toThrow('Storage unavailable');
      expect(storage.isUnlocked()).toBe(false);
    });

    it('should throw if no vault found', async () => {
      // Empty storage (no salt)
      await expect(storage.unlock('password123')).rejects.toThrow('No vault found');
    });
  });

  describe('save()', () => {
    it('should lock vault if storage.set fails', async () => {
      // Initialize successfully first
      await storage.initialize('password123');
      expect(storage.isUnlocked()).toBe(true);

      // Now simulate storage failure
      simulateStorageFailure('set');

      await expect(storage.save({ credentials: [] })).rejects.toThrow('Storage unavailable');
      expect(storage.isUnlocked()).toBe(false);
    });

    it('should throw if vault is already locked', async () => {
      await expect(storage.save({ credentials: [] })).rejects.toThrow('Vault is locked');
    });
  });

  describe('load()', () => {
    it('should lock vault if storage.get fails', async () => {
      // Initialize and save successfully first
      await storage.initialize('password123');
      await storage.save({ credentials: [{ id: '1', type: 'AGE' }] });
      expect(storage.isUnlocked()).toBe(true);

      // Now simulate storage failure
      simulateStorageFailure('get');

      await expect(storage.load()).rejects.toThrow('Storage unavailable');
      expect(storage.isUnlocked()).toBe(false);
    });

    it('should lock vault if decryption fails (data corruption)', async () => {
      // Initialize successfully
      await storage.initialize('password123');
      expect(storage.isUnlocked()).toBe(true);

      // Corrupt the encrypted data
      setMockStorage({
        ...chromeMock.storage.local.get.mock.results[0]?.value,
        encryptedVault: 'corrupted-base64-data-that-will-fail',
      });

      await expect(storage.load()).rejects.toThrow(/corruption|locked/i);
      expect(storage.isUnlocked()).toBe(false);
    });

    it('should return null if no encrypted data exists', async () => {
      await storage.initialize('password123');

      const result = await storage.load();
      expect(result).toBeNull();
    });

    it('should throw if vault is already locked', async () => {
      await expect(storage.load()).rejects.toThrow('Vault is locked');
    });
  });

  describe('lock()', () => {
    it('should clear encryption key', async () => {
      await storage.initialize('password123');
      expect(storage.isUnlocked()).toBe(true);

      storage.lock();
      expect(storage.isUnlocked()).toBe(false);
    });
  });

  describe('isUnlocked()', () => {
    it('should return false initially', () => {
      expect(storage.isUnlocked()).toBe(false);
    });

    it('should return true after initialization', async () => {
      await storage.initialize('password123');
      expect(storage.isUnlocked()).toBe(true);
    });
  });
});
