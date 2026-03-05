/**
 * CredentialManager - Manage user credentials
 *
 * NOTE: Encryption is intentionally deferred to Phase 3 (Wallet Extension).
 * The wallet extension will use secure browser extension storage APIs which
 * provide better security guarantees than browser localStorage encryption.
 *
 * For MVP, credentials are stored with proper serialization but without encryption.
 * Production deployments should use the wallet extension or a secure backend.
 */

import type { Credential, CredentialType } from '@midnight-cloak/core';

/** Error thrown when credential operations fail */
export class CredentialManagerError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'CredentialManagerError';
  }
}

export interface CredentialManagerConfig {
  /** Storage type: 'local' persists across sessions, 'session' clears on tab close */
  storage?: 'local' | 'session';
  /**
   * Encryption key for credential storage.
   * NOTE: Encryption is deferred to Phase 3 (Wallet Extension).
   * This option is reserved for future use.
   */
  encryptionKey?: string;
  /** Called when storage errors occur */
  onStorageError?: (error: CredentialManagerError) => void;
  /** Whether to automatically filter expired credentials (default: true) */
  filterExpired?: boolean;
}

/**
 * Serialize credentials to JSON with proper Uint8Array handling.
 * Converts Uint8Array fields to a tagged format that can be restored.
 */
function serializeCredentials(credentials: Credential[]): string {
  return JSON.stringify(credentials, (_key, value) => {
    if (value instanceof Uint8Array) {
      return {
        __type: 'Uint8Array',
        data: Array.from(value),
      };
    }
    return value;
  });
}

/**
 * Deserialize credentials from JSON with proper Uint8Array restoration.
 */
function deserializeCredentials(json: string): unknown[] {
  return JSON.parse(json, (_key, value) => {
    if (value && typeof value === 'object' && value.__type === 'Uint8Array' && Array.isArray(value.data)) {
      return new Uint8Array(value.data);
    }
    return value;
  });
}

/**
 * Validate that an object has the required Credential structure.
 * Returns validation errors or null if valid.
 */
function validateCredential(obj: unknown): string[] | null {
  const errors: string[] = [];

  if (!obj || typeof obj !== 'object') {
    return ['Credential must be an object'];
  }

  const cred = obj as Record<string, unknown>;

  // Required string fields
  if (typeof cred.id !== 'string' || cred.id.length === 0) {
    errors.push('id must be a non-empty string');
  }
  if (typeof cred.type !== 'string') {
    errors.push('type must be a string');
  }
  if (typeof cred.issuer !== 'string' || cred.issuer.length === 0) {
    errors.push('issuer must be a non-empty string');
  }
  if (typeof cred.subject !== 'string' || cred.subject.length === 0) {
    errors.push('subject must be a non-empty string');
  }

  // Claims object
  if (!cred.claims || typeof cred.claims !== 'object') {
    errors.push('claims must be an object');
  }

  // Timestamps
  if (typeof cred.issuedAt !== 'number' || cred.issuedAt <= 0) {
    errors.push('issuedAt must be a positive number');
  }
  if (cred.expiresAt !== null && typeof cred.expiresAt !== 'number') {
    errors.push('expiresAt must be a number or null');
  }

  // Signature
  if (!(cred.signature instanceof Uint8Array)) {
    errors.push('signature must be a Uint8Array');
  }

  return errors.length > 0 ? errors : null;
}

/**
 * Check if a credential has expired.
 */
function isExpired(credential: Credential): boolean {
  if (credential.expiresAt === null) {
    return false;
  }
  return Date.now() > credential.expiresAt;
}

export class CredentialManager {
  private credentials: Map<string, Credential> = new Map();
  private readonly storageKey = 'midnight-cloak:credentials';
  private storage: Storage | null;
  private onStorageError?: (error: CredentialManagerError) => void;
  private filterExpired: boolean;

  constructor(config: CredentialManagerConfig = {}) {
    this.filterExpired = config.filterExpired ?? true;
    this.onStorageError = config.onStorageError;

    // Handle SSR - storage may not be available
    if (typeof globalThis.localStorage === 'undefined') {
      this.storage = null;
    } else {
      this.storage =
        config.storage === 'session'
          ? globalThis.sessionStorage
          : globalThis.localStorage;
    }

    this.loadFromStorage();
  }

  /**
   * Store a credential.
   * @throws {CredentialManagerError} If credential validation fails
   */
  async store(credential: Credential): Promise<void> {
    // Validate credential structure
    const errors = validateCredential(credential);
    if (errors) {
      throw new CredentialManagerError(
        `Invalid credential: ${errors.join(', ')}`,
        'INVALID_CREDENTIAL'
      );
    }

    // Check for expiry
    if (isExpired(credential)) {
      throw new CredentialManagerError(
        'Cannot store expired credential',
        'CREDENTIAL_EXPIRED'
      );
    }

    this.credentials.set(credential.id, credential);
    this.saveToStorage();
  }

  /**
   * Get a credential by ID.
   * Returns undefined if not found or expired (when filterExpired is enabled).
   */
  async get(id: string): Promise<Credential | undefined> {
    const credential = this.credentials.get(id);
    if (!credential) {
      return undefined;
    }

    if (this.filterExpired && isExpired(credential)) {
      // Remove expired credential
      this.credentials.delete(id);
      this.saveToStorage();
      return undefined;
    }

    return credential;
  }

  /**
   * Get all credentials.
   * Expired credentials are filtered out when filterExpired is enabled.
   */
  async getAll(): Promise<Credential[]> {
    const all = Array.from(this.credentials.values());

    if (!this.filterExpired) {
      return all;
    }

    const { valid, expired } = this.partitionByExpiry(all);

    // Clean up expired credentials
    if (expired.length > 0) {
      for (const cred of expired) {
        this.credentials.delete(cred.id);
      }
      this.saveToStorage();
    }

    return valid;
  }

  /**
   * Get credentials by type.
   * Expired credentials are filtered out when filterExpired is enabled.
   */
  async getByType(type: CredentialType): Promise<Credential[]> {
    const all = await this.getAll();
    return all.filter((c) => c.type === type);
  }

  /**
   * Delete a credential by ID.
   */
  async delete(id: string): Promise<void> {
    this.credentials.delete(id);
    this.saveToStorage();
  }

  /**
   * Clear all credentials.
   */
  async clear(): Promise<void> {
    this.credentials.clear();
    this.saveToStorage();
  }

  /**
   * Get count of stored credentials (including expired).
   */
  get count(): number {
    return this.credentials.size;
  }

  /**
   * Check if a credential exists by ID.
   */
  has(id: string): boolean {
    return this.credentials.has(id);
  }

  /**
   * Partition credentials into valid and expired.
   */
  private partitionByExpiry(credentials: Credential[]): {
    valid: Credential[];
    expired: Credential[];
  } {
    const valid: Credential[] = [];
    const expired: Credential[] = [];

    for (const cred of credentials) {
      if (isExpired(cred)) {
        expired.push(cred);
      } else {
        valid.push(cred);
      }
    }

    return { valid, expired };
  }

  private loadFromStorage(): void {
    if (!this.storage) {
      return;
    }

    try {
      const stored = this.storage.getItem(this.storageKey);
      if (!stored) {
        return;
      }

      const parsed = deserializeCredentials(stored);

      if (!Array.isArray(parsed)) {
        throw new Error('Stored credentials is not an array');
      }

      let loadedCount = 0;
      let skippedCount = 0;

      for (const item of parsed) {
        const errors = validateCredential(item);
        if (errors) {
          skippedCount++;
          continue;
        }

        const credential = item as Credential;

        // Skip expired credentials on load if filtering is enabled
        if (this.filterExpired && isExpired(credential)) {
          skippedCount++;
          continue;
        }

        this.credentials.set(credential.id, credential);
        loadedCount++;
      }

      // If we skipped some credentials, save the cleaned-up version
      if (skippedCount > 0) {
        this.saveToStorage();
      }
    } catch (error) {
      const credError = new CredentialManagerError(
        'Failed to load credentials from storage',
        'STORAGE_LOAD_ERROR',
        error
      );

      if (this.onStorageError) {
        this.onStorageError(credError);
      } else {
        console.warn('[CredentialManager]', credError.message, error);
      }

      // Clear corrupted storage
      try {
        this.storage.removeItem(this.storageKey);
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  private saveToStorage(): void {
    if (!this.storage) {
      return;
    }

    try {
      const toStore = Array.from(this.credentials.values());
      const serialized = serializeCredentials(toStore);
      this.storage.setItem(this.storageKey, serialized);
    } catch (error) {
      const credError = new CredentialManagerError(
        'Failed to save credentials to storage',
        'STORAGE_SAVE_ERROR',
        error
      );

      if (this.onStorageError) {
        this.onStorageError(credError);
      } else {
        console.warn('[CredentialManager]', credError.message, error);
      }
    }
  }
}
