/**
 * Encrypted storage using Argon2id + AES-256-GCM
 *
 * Security design:
 * - Argon2id for key derivation (memory-hard, GPU-resistant)
 * - Key derivation runs in offscreen document (WASM allowed there)
 * - AES-256-GCM for authenticated encryption
 * - Random salt stored in chrome.storage (per-wallet)
 * - Random IV per encryption operation
 * - Encryption key held in memory only, never persisted
 */

// Salt and IV sizes
const SALT_LENGTH = 16;
const IV_LENGTH = 12;

export interface VaultData {
  credentials: unknown[];
  [key: string]: unknown;
}

// Offscreen document management
let offscreenCreated = false;

async function ensureOffscreenDocument(): Promise<void> {
  if (offscreenCreated) {
    return;
  }

  // Check if offscreen document already exists
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
  });

  if (existingContexts.length > 0) {
    offscreenCreated = true;
    return;
  }

  // Create offscreen document
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: [chrome.offscreen.Reason.DOM_PARSER], // Using DOM_PARSER as a generic reason
    justification: 'Argon2 key derivation requires WASM which is not available in service workers',
  });

  // Wait for offscreen document to be ready
  // The document needs time to load and register its message listener
  await new Promise((resolve) => setTimeout(resolve, 100));

  offscreenCreated = true;
  console.log('[EncryptedStorage] Offscreen document created');
}

async function deriveKeyViaOffscreen(password: string, salt: Uint8Array): Promise<Uint8Array> {
  await ensureOffscreenDocument();

  console.log('[EncryptedStorage] Sending DERIVE_KEY to offscreen...');

  const response = await chrome.runtime.sendMessage({
    type: 'DERIVE_KEY',
    password,
    salt: Array.from(salt),
  });

  console.log('[EncryptedStorage] Received response from offscreen:', JSON.stringify(response));

  if (!response) {
    throw new Error('Key derivation failed - no response from offscreen (undefined)');
  }

  if (!response.success) {
    throw new Error(response.error || 'Key derivation failed - offscreen returned failure');
  }

  return new Uint8Array(response.keyBytes);
}

export class EncryptedStorage {
  private encryptionKey: CryptoKey | null = null;

  /**
   * Initialize a new vault with a password
   * Creates a new salt and derives the encryption key
   *
   * SECURITY: Fails-closed if salt cannot be persisted - vault is not usable
   * without the salt for future unlocks.
   */
  async initialize(password: string): Promise<void> {
    // Generate random salt
    const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
    console.log('[EncryptedStorage] initialize - generated salt:', Array.from(salt.slice(0, 4)), '...');

    // Derive key using Argon2id via offscreen document
    this.encryptionKey = await this.deriveKey(password, salt);
    console.log('[EncryptedStorage] initialize - key derived successfully');

    // Store salt (but not the key!)
    try {
      await chrome.storage.local.set({
        salt: Array.from(salt),
      });
      console.log('[EncryptedStorage] initialize - salt stored');
    } catch (storageError) {
      // SECURITY: Fail-closed - if we can't store salt, vault is unusable
      // Clear the key since we can't recover without the salt
      console.error('[EncryptedStorage] Storage failure during initialize - failing closed');
      this.encryptionKey = null;
      throw new Error('Storage unavailable - vault initialization failed');
    }
  }

  /**
   * Unlock an existing vault with a password
   * Retrieves the salt and derives the encryption key
   */
  async unlock(password: string): Promise<void> {
    // Get stored salt
    let result: { salt?: number[]; encryptedVault?: string };
    try {
      result = await chrome.storage.local.get(['salt', 'encryptedVault']);
    } catch (storageError) {
      // SECURITY: Fail-closed on storage failure
      console.error('[EncryptedStorage] Storage failure during unlock - failing closed');
      this.encryptionKey = null;
      throw new Error('Storage unavailable');
    }

    console.log('[EncryptedStorage] unlock - stored data:', {
      hasSalt: !!result.salt,
      saltLength: result.salt?.length,
      hasVault: !!result.encryptedVault,
    });

    if (!result.salt) {
      throw new Error('No vault found');
    }

    const salt = new Uint8Array(result.salt);
    console.log('[EncryptedStorage] unlock - salt bytes:', Array.from(salt.slice(0, 4)), '...');

    // Derive key using Argon2id via offscreen document
    this.encryptionKey = await this.deriveKey(password, salt);
    console.log('[EncryptedStorage] unlock - key derived successfully');

    // Verify by attempting to decrypt
    if (result.encryptedVault) {
      try {
        await this.decrypt(result.encryptedVault);
        console.log('[EncryptedStorage] unlock - decryption successful');
      } catch (err) {
        console.error('[EncryptedStorage] unlock - decryption failed:', err);
        this.encryptionKey = null;
        throw new Error('Incorrect password');
      }
    }
  }

  /**
   * Lock the vault (clear encryption key from memory)
   */
  lock(): void {
    this.encryptionKey = null;
  }

  /**
   * Check if the vault is unlocked
   */
  isUnlocked(): boolean {
    return this.encryptionKey !== null;
  }

  /**
   * Save data to encrypted storage
   *
   * SECURITY: Fails-closed on storage errors - locks vault to prevent
   * operating with stale data or inconsistent state.
   */
  async save(data: VaultData): Promise<void> {
    if (!this.encryptionKey) {
      throw new Error('Vault is locked');
    }

    const encryptedVault = await this.encrypt(data);

    try {
      await chrome.storage.local.set({ encryptedVault });
    } catch (storageError) {
      // SECURITY: Fail-closed on storage failure
      // If we can't persist data, lock the vault to prevent operating
      // with stale state or giving false confidence that data was saved
      console.error('[EncryptedStorage] Storage failure during save - locking vault');
      this.encryptionKey = null;
      throw new Error('Storage unavailable - vault locked for security');
    }
  }

  /**
   * Load data from encrypted storage
   *
   * SECURITY: Fails-closed on storage errors - locks vault to prevent
   * operating with potentially corrupted or unavailable data.
   */
  async load(): Promise<VaultData | null> {
    if (!this.encryptionKey) {
      throw new Error('Vault is locked');
    }

    let result: { encryptedVault?: string };
    try {
      result = await chrome.storage.local.get(['encryptedVault']);
    } catch (storageError) {
      // SECURITY: Fail-closed on storage failure
      console.error('[EncryptedStorage] Storage failure during load - locking vault');
      this.encryptionKey = null;
      throw new Error('Storage unavailable - vault locked for security');
    }

    if (!result.encryptedVault) {
      return null;
    }

    try {
      return this.decrypt(result.encryptedVault);
    } catch (decryptError) {
      // SECURITY: Fail-closed on decryption failure (data corruption)
      console.error('[EncryptedStorage] Decryption failure during load - locking vault');
      this.encryptionKey = null;
      throw new Error('Data corruption detected - vault locked for security');
    }
  }

  /**
   * Derive encryption key from password using Argon2id
   * Key derivation happens in offscreen document where WASM is allowed
   */
  private async deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
    // Get key bytes from offscreen document (Argon2id)
    const keyBytes = await deriveKeyViaOffscreen(password, salt);

    // Import as AES-GCM key
    return crypto.subtle.importKey(
      'raw',
      keyBytes.buffer as ArrayBuffer,
      { name: 'AES-GCM', length: 256 },
      false, // not extractable
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Encrypt data using AES-256-GCM
   */
  private async encrypt(data: VaultData): Promise<string> {
    if (!this.encryptionKey) {
      throw new Error('No encryption key');
    }

    // Generate random IV
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

    // Encode data as JSON
    const encoder = new TextEncoder();
    const plaintext = encoder.encode(JSON.stringify(data));

    // Encrypt
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      this.encryptionKey,
      plaintext
    );

    // Combine IV + ciphertext and encode as base64
    const combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(ciphertext), iv.length);

    return btoa(String.fromCharCode(...combined));
  }

  /**
   * Decrypt data using AES-256-GCM
   */
  private async decrypt(encryptedData: string): Promise<VaultData> {
    if (!this.encryptionKey) {
      throw new Error('No encryption key');
    }

    // Decode from base64
    const combined = new Uint8Array(
      atob(encryptedData)
        .split('')
        .map((c) => c.charCodeAt(0))
    );

    // Extract IV and ciphertext
    const iv = combined.slice(0, IV_LENGTH);
    const ciphertext = combined.slice(IV_LENGTH);

    // Decrypt
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      this.encryptionKey,
      ciphertext
    );

    // Decode JSON
    const decoder = new TextDecoder();
    return JSON.parse(decoder.decode(plaintext));
  }
}
