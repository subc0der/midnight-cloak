import { describe, it, expect, vi } from 'vitest';
import {
  createBackup,
  restoreBackup,
  mergeCredentials,
  validateCredential,
  type BackupFile,
} from '../../src/shared/storage/credential-backup';

describe('credential-backup', () => {
  // Mock key derivation function that returns deterministic key
  const mockDeriveKey = vi.fn(async (_password: string, _salt: Uint8Array): Promise<Uint8Array> => {
    // Return a 32-byte key (256 bits for AES-256)
    return new Uint8Array(32).fill(42);
  });

  const sampleCredential = {
    id: 'cred-123',
    type: 'AGE',
    issuer: 'issuer-address-123',
    subject: 'subject-address-456',
    claims: { birthDate: '1990-01-15' },
    issuedAt: 1700000000000,
    expiresAt: null,
    signature: new Uint8Array([1, 2, 3, 4]),
  };

  describe('validateCredential', () => {
    it('should return null for valid credential', () => {
      const errors = validateCredential(sampleCredential);
      expect(errors).toBeNull();
    });

    it('should reject non-object', () => {
      const errors = validateCredential('not an object');
      expect(errors).toContain('Credential must be an object');
    });

    it('should reject null', () => {
      const errors = validateCredential(null);
      expect(errors).toContain('Credential must be an object');
    });

    it('should reject missing id', () => {
      const errors = validateCredential({ ...sampleCredential, id: '' });
      expect(errors).toContain('id must be a non-empty string');
    });

    it('should reject missing type', () => {
      const errors = validateCredential({ ...sampleCredential, type: 123 });
      expect(errors).toContain('type must be a string');
    });

    it('should reject missing issuer', () => {
      const errors = validateCredential({ ...sampleCredential, issuer: 123 });
      expect(errors).toContain('issuer must be a string');
    });

    it('should reject missing claims', () => {
      const errors = validateCredential({ ...sampleCredential, claims: null });
      expect(errors).toContain('claims must be an object');
    });

    it('should reject invalid issuedAt', () => {
      const errors = validateCredential({ ...sampleCredential, issuedAt: -1 });
      expect(errors).toContain('issuedAt must be a positive number');
    });

    it('should accept serialized Uint8Array signature', () => {
      const serializedCred = {
        ...sampleCredential,
        signature: { __type: 'Uint8Array', data: [1, 2, 3, 4] },
      };
      const errors = validateCredential(serializedCred);
      expect(errors).toBeNull();
    });

    it('should reject invalid signature', () => {
      const errors = validateCredential({ ...sampleCredential, signature: 'not-valid' });
      expect(errors).toContain('signature must be a Uint8Array or serialized Uint8Array');
    });
  });

  describe('createBackup', () => {
    it('should create encrypted backup with correct structure', async () => {
      const credentials = [sampleCredential];
      const backup = await createBackup(credentials, 'test-password', mockDeriveKey);

      expect(backup.version).toBe(1);
      expect(backup.encrypted).toBeDefined();
      expect(backup.salt).toHaveLength(16);
      expect(backup.exportedAt).toBeGreaterThan(0);
      expect(backup.credentialCount).toBe(1);
    });

    it('should call deriveKey with password and salt', async () => {
      await createBackup([sampleCredential], 'my-password', mockDeriveKey);

      expect(mockDeriveKey).toHaveBeenCalledWith('my-password', expect.any(Uint8Array));
    });

    it('should create different salt for each backup', async () => {
      const backup1 = await createBackup([sampleCredential], 'test', mockDeriveKey);
      const backup2 = await createBackup([sampleCredential], 'test', mockDeriveKey);

      expect(backup1.salt).not.toEqual(backup2.salt);
    });
  });

  describe('restoreBackup', () => {
    it('should restore credentials from backup', async () => {
      const credentials = [sampleCredential];
      const backup = await createBackup(credentials, 'test-password', mockDeriveKey);

      const restored = await restoreBackup(backup, 'test-password', mockDeriveKey);

      expect(restored).toHaveLength(1);
      expect((restored[0] as typeof sampleCredential).id).toBe('cred-123');
      expect((restored[0] as typeof sampleCredential).type).toBe('AGE');
    });

    it('should restore Uint8Array signature correctly', async () => {
      const credentials = [sampleCredential];
      const backup = await createBackup(credentials, 'test-password', mockDeriveKey);

      const restored = await restoreBackup(backup, 'test-password', mockDeriveKey);

      const signature = (restored[0] as typeof sampleCredential).signature;
      expect(signature).toBeInstanceOf(Uint8Array);
      expect(Array.from(signature)).toEqual([1, 2, 3, 4]);
    });

    it('should reject unsupported backup version', async () => {
      const invalidBackup: BackupFile = {
        version: 99,
        encrypted: 'test',
        salt: [1, 2, 3],
        exportedAt: Date.now(),
        credentialCount: 1,
      };

      await expect(restoreBackup(invalidBackup, 'test', mockDeriveKey)).rejects.toThrow(
        'Unsupported backup version: 99'
      );
    });

    it('should reject invalid backup format', async () => {
      const invalidBackup = {
        version: 1,
        encrypted: null,
        salt: null,
      } as unknown as BackupFile;

      await expect(restoreBackup(invalidBackup, 'test', mockDeriveKey)).rejects.toThrow(
        'Invalid backup format'
      );
    });
  });

  describe('mergeCredentials', () => {
    const cred1 = { id: 'cred-1', type: 'AGE' };
    const cred2 = { id: 'cred-2', type: 'AGE' };
    const cred3 = { id: 'cred-3', type: 'TOKEN_BALANCE' };

    it('should merge non-duplicate credentials', () => {
      const existing = [cred1];
      const imported = [cred2, cred3];

      const result = mergeCredentials(existing, imported);

      expect(result.merged).toHaveLength(3);
      expect(result.added).toBe(2);
      expect(result.skipped).toBe(0);
    });

    it('should skip duplicate credentials by ID', () => {
      const existing = [cred1, cred2];
      const imported = [cred2, cred3]; // cred2 is duplicate

      const result = mergeCredentials(existing, imported);

      expect(result.merged).toHaveLength(3);
      expect(result.added).toBe(1);
      expect(result.skipped).toBe(1);
    });

    it('should return empty arrays when both inputs are empty', () => {
      const result = mergeCredentials([], []);

      expect(result.merged).toHaveLength(0);
      expect(result.added).toBe(0);
      expect(result.skipped).toBe(0);
    });

    it('should handle import into empty vault', () => {
      const result = mergeCredentials([], [cred1, cred2]);

      expect(result.merged).toHaveLength(2);
      expect(result.added).toBe(2);
      expect(result.skipped).toBe(0);
    });

    it('should skip all when all are duplicates', () => {
      const existing = [cred1, cred2];
      const imported = [cred1, cred2];

      const result = mergeCredentials(existing, imported);

      expect(result.merged).toHaveLength(2);
      expect(result.added).toBe(0);
      expect(result.skipped).toBe(2);
    });
  });
});
