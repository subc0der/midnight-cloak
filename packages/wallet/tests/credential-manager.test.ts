import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CredentialManager, CredentialManagerError } from '../src/credential-manager';
import type { Credential } from '@midnight-cloak/core';

// Mock localStorage
const createMockStorage = () => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
  };
};

// Helper to create a valid credential
function createCredential(overrides: Partial<Credential> = {}): Credential {
  return {
    id: 'cred-123',
    type: 'AGE',
    issuer: 'mn_addr_preprod1issuer',
    subject: 'mn_addr_preprod1subject',
    claims: { birthYear: 1990 },
    issuedAt: Date.now(),
    expiresAt: Date.now() + 86400000, // 1 day from now
    signature: new Uint8Array([1, 2, 3, 4, 5]),
    ...overrides,
  };
}

describe('CredentialManager', () => {
  let mockStorage: ReturnType<typeof createMockStorage>;

  beforeEach(() => {
    mockStorage = createMockStorage();
    vi.stubGlobal('localStorage', mockStorage);
    vi.stubGlobal('sessionStorage', mockStorage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('constructor', () => {
    it('should initialize with default config', () => {
      const manager = new CredentialManager();
      expect(manager.count).toBe(0);
    });

    it('should use sessionStorage when configured', () => {
      const sessionStorage = createMockStorage();
      vi.stubGlobal('sessionStorage', sessionStorage);

      new CredentialManager({ storage: 'session' });
      // Should use sessionStorage for loading
      expect(sessionStorage.getItem).toHaveBeenCalled();
    });

    it('should load existing credentials from storage', () => {
      const cred = createCredential();
      mockStorage.setItem(
        'midnight-cloak:credentials',
        JSON.stringify([{
          ...cred,
          signature: { __type: 'Uint8Array', data: Array.from(cred.signature) },
        }])
      );

      const manager = new CredentialManager();
      expect(manager.count).toBe(1);
    });
  });

  describe('store()', () => {
    it('should store a valid credential', async () => {
      const manager = new CredentialManager();
      const cred = createCredential();

      await manager.store(cred);

      expect(manager.count).toBe(1);
      expect(manager.has(cred.id)).toBe(true);
    });

    it('should persist to storage', async () => {
      const manager = new CredentialManager();
      const cred = createCredential();

      await manager.store(cred);

      expect(mockStorage.setItem).toHaveBeenCalled();
    });

    it('should reject invalid credential - missing id', async () => {
      const manager = new CredentialManager();
      const cred = createCredential({ id: '' });

      await expect(manager.store(cred)).rejects.toThrow(CredentialManagerError);
      await expect(manager.store(cred)).rejects.toThrow('id must be a non-empty string');
    });

    it('should reject invalid credential - missing issuer', async () => {
      const manager = new CredentialManager();
      const cred = createCredential({ issuer: '' });

      await expect(manager.store(cred)).rejects.toThrow('issuer must be a non-empty string');
    });

    it('should reject invalid credential - missing subject', async () => {
      const manager = new CredentialManager();
      const cred = createCredential({ subject: '' });

      await expect(manager.store(cred)).rejects.toThrow('subject must be a non-empty string');
    });

    it('should reject invalid credential - invalid signature', async () => {
      const manager = new CredentialManager();
      const cred = createCredential();
      (cred as unknown as { signature: string }).signature = 'not-uint8array';

      await expect(manager.store(cred)).rejects.toThrow('signature must be a Uint8Array');
    });

    it('should reject expired credential', async () => {
      const manager = new CredentialManager();
      const cred = createCredential({ expiresAt: Date.now() - 1000 });

      await expect(manager.store(cred)).rejects.toThrow('Cannot store expired credential');
    });

    it('should allow credential with null expiresAt', async () => {
      const manager = new CredentialManager();
      const cred = createCredential({ expiresAt: null });

      await manager.store(cred);
      expect(manager.count).toBe(1);
    });
  });

  describe('get()', () => {
    it('should retrieve stored credential', async () => {
      const manager = new CredentialManager();
      const cred = createCredential();
      await manager.store(cred);

      const retrieved = await manager.get(cred.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(cred.id);
      expect(retrieved?.type).toBe(cred.type);
    });

    it('should return undefined for non-existent credential', async () => {
      const manager = new CredentialManager();

      const retrieved = await manager.get('non-existent');

      expect(retrieved).toBeUndefined();
    });

    it('should filter expired credentials when filterExpired is true', async () => {
      const manager = new CredentialManager({ filterExpired: true });
      const cred = createCredential({ expiresAt: Date.now() + 100 });
      await manager.store(cred);

      // Wait for expiry
      await new Promise((resolve) => setTimeout(resolve, 150));

      const retrieved = await manager.get(cred.id);
      expect(retrieved).toBeUndefined();
    });

    it('should return expired credentials when filterExpired is false', async () => {
      const manager = new CredentialManager({ filterExpired: false });
      const cred = createCredential({ expiresAt: Date.now() + 100 });
      await manager.store(cred);

      // Wait for expiry
      await new Promise((resolve) => setTimeout(resolve, 150));

      const retrieved = await manager.get(cred.id);
      expect(retrieved).toBeDefined();
    });
  });

  describe('getAll()', () => {
    it('should return all credentials', async () => {
      const manager = new CredentialManager();
      await manager.store(createCredential({ id: 'cred-1' }));
      await manager.store(createCredential({ id: 'cred-2' }));
      await manager.store(createCredential({ id: 'cred-3' }));

      const all = await manager.getAll();

      expect(all).toHaveLength(3);
    });

    it('should filter expired credentials', async () => {
      const manager = new CredentialManager({ filterExpired: true });
      await manager.store(createCredential({ id: 'valid', expiresAt: Date.now() + 10000 }));
      await manager.store(createCredential({ id: 'expired', expiresAt: Date.now() + 50 }));

      // Wait for one to expire
      await new Promise((resolve) => setTimeout(resolve, 100));

      const all = await manager.getAll();
      expect(all).toHaveLength(1);
      expect(all[0].id).toBe('valid');
    });
  });

  describe('getByType()', () => {
    it('should filter credentials by type', async () => {
      const manager = new CredentialManager();
      await manager.store(createCredential({ id: 'age-1', type: 'AGE' }));
      await manager.store(createCredential({ id: 'age-2', type: 'AGE' }));
      await manager.store(createCredential({ id: 'token-1', type: 'TOKEN_BALANCE' }));

      const ageCredentials = await manager.getByType('AGE');

      expect(ageCredentials).toHaveLength(2);
      expect(ageCredentials.every((c) => c.type === 'AGE')).toBe(true);
    });
  });

  describe('delete()', () => {
    it('should remove a credential', async () => {
      const manager = new CredentialManager();
      const cred = createCredential();
      await manager.store(cred);

      await manager.delete(cred.id);

      expect(manager.count).toBe(0);
      expect(manager.has(cred.id)).toBe(false);
    });

    it('should not throw for non-existent credential', async () => {
      const manager = new CredentialManager();

      await expect(manager.delete('non-existent')).resolves.not.toThrow();
    });
  });

  describe('clear()', () => {
    it('should remove all credentials', async () => {
      const manager = new CredentialManager();
      await manager.store(createCredential({ id: 'cred-1' }));
      await manager.store(createCredential({ id: 'cred-2' }));

      await manager.clear();

      expect(manager.count).toBe(0);
    });
  });

  describe('has()', () => {
    it('should return true for existing credential', async () => {
      const manager = new CredentialManager();
      const cred = createCredential();
      await manager.store(cred);

      expect(manager.has(cred.id)).toBe(true);
    });

    it('should return false for non-existent credential', () => {
      const manager = new CredentialManager();

      expect(manager.has('non-existent')).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should call onStorageError callback on load failure', () => {
      const onStorageError = vi.fn();
      mockStorage.getItem.mockReturnValue('invalid json {{{');

      new CredentialManager({ onStorageError });

      expect(onStorageError).toHaveBeenCalled();
      expect(onStorageError.mock.calls[0][0]).toBeInstanceOf(CredentialManagerError);
    });

    it('should call onStorageError callback on save failure', async () => {
      const onStorageError = vi.fn();
      mockStorage.setItem.mockImplementation(() => {
        throw new Error('Storage full');
      });

      const manager = new CredentialManager({ onStorageError });
      await manager.store(createCredential());

      expect(onStorageError).toHaveBeenCalled();
    });
  });

  describe('serialization', () => {
    it('should correctly serialize and deserialize Uint8Array signatures', async () => {
      const manager = new CredentialManager();
      const signature = new Uint8Array([10, 20, 30, 40, 50]);
      const cred = createCredential({ signature });

      await manager.store(cred);

      // Create new manager to load from storage
      const manager2 = new CredentialManager();
      const retrieved = await manager2.get(cred.id);

      expect(retrieved?.signature).toBeInstanceOf(Uint8Array);
      expect(Array.from(retrieved?.signature ?? [])).toEqual([10, 20, 30, 40, 50]);
    });
  });
});
