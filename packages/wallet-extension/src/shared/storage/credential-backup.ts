/**
 * Credential Backup - Export/Import functionality
 *
 * Provides encrypted backup and restore capabilities for credentials.
 * Uses Argon2id + AES-256-GCM (same as vault encryption).
 *
 * Export format:
 * {
 *   version: 1,
 *   encrypted: base64-encoded(IV + AES-256-GCM ciphertext),
 *   salt: number[] (for key derivation)
 * }
 */

// Salt and IV sizes (same as encrypted-storage.ts)
const SALT_LENGTH = 16;
const IV_LENGTH = 12;

export interface BackupFile {
  version: number;
  encrypted: string;
  salt: number[];
  exportedAt: number;
  credentialCount: number;
}

export interface ExportedCredential {
  id: string;
  type: string;
  issuer: string;
  subject: string;
  claims: Record<string, unknown>;
  issuedAt: number;
  expiresAt: number | null;
  signature: { __type: 'Uint8Array'; data: number[] };
}

/**
 * Serialize credentials for export with proper Uint8Array handling.
 */
function serializeCredentials(credentials: unknown[]): string {
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
 * Deserialize credentials from backup with proper Uint8Array restoration.
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
 * Validate imported credential structure.
 * Returns validation errors or null if valid.
 */
export function validateCredential(obj: unknown): string[] | null {
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
  if (typeof cred.issuer !== 'string') {
    errors.push('issuer must be a string');
  }
  if (typeof cred.subject !== 'string') {
    errors.push('subject must be a string');
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

  // Signature - can be Uint8Array or serialized format
  const sig = cred.signature;
  const isValidSig =
    sig instanceof Uint8Array ||
    (sig && typeof sig === 'object' && (sig as { __type?: string }).__type === 'Uint8Array');
  if (!isValidSig) {
    errors.push('signature must be a Uint8Array or serialized Uint8Array');
  }

  return errors.length > 0 ? errors : null;
}

/**
 * Create an encrypted backup of credentials.
 *
 * @param credentials - Array of credentials to backup
 * @param password - Password to encrypt the backup (can be different from vault password)
 * @param deriveKey - Function to derive encryption key (uses offscreen document)
 * @returns Encrypted backup file content
 */
export async function createBackup(
  credentials: unknown[],
  password: string,
  deriveKey: (password: string, salt: Uint8Array) => Promise<Uint8Array>
): Promise<BackupFile> {
  // Generate random salt for this backup
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));

  // Derive encryption key using Argon2id
  const keyBytes = await deriveKey(password, salt);
  const encryptionKey = await crypto.subtle.importKey(
    'raw',
    keyBytes.buffer as ArrayBuffer,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );

  // Generate random IV
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  // Serialize credentials
  const plaintext = serializeCredentials(credentials);
  const encoder = new TextEncoder();
  const plaintextBytes = encoder.encode(plaintext);

  // Encrypt
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    encryptionKey,
    plaintextBytes
  );

  // Combine IV + ciphertext and encode as base64
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);

  return {
    version: 1,
    encrypted: btoa(String.fromCharCode(...combined)),
    salt: Array.from(salt),
    exportedAt: Date.now(),
    credentialCount: credentials.length,
  };
}

/**
 * Restore credentials from an encrypted backup.
 *
 * @param backup - Encrypted backup file content
 * @param password - Password used to encrypt the backup
 * @param deriveKey - Function to derive encryption key (uses offscreen document)
 * @returns Array of restored credentials
 */
export async function restoreBackup(
  backup: BackupFile,
  password: string,
  deriveKey: (password: string, salt: Uint8Array) => Promise<Uint8Array>
): Promise<unknown[]> {
  // Validate backup format
  if (backup.version !== 1) {
    throw new Error(`Unsupported backup version: ${backup.version}`);
  }

  if (!backup.encrypted || !backup.salt) {
    throw new Error('Invalid backup format: missing required fields');
  }

  // Derive decryption key using Argon2id
  const salt = new Uint8Array(backup.salt);
  const keyBytes = await deriveKey(password, salt);
  const decryptionKey = await crypto.subtle.importKey(
    'raw',
    keyBytes.buffer as ArrayBuffer,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );

  // Decode from base64
  const combined = new Uint8Array(
    atob(backup.encrypted)
      .split('')
      .map((c) => c.charCodeAt(0))
  );

  // Extract IV and ciphertext
  const iv = combined.slice(0, IV_LENGTH);
  const ciphertext = combined.slice(IV_LENGTH);

  // Decrypt
  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      decryptionKey,
      ciphertext
    );
  } catch {
    throw new Error('Incorrect password or corrupted backup');
  }

  // Decode JSON
  const decoder = new TextDecoder();
  const json = decoder.decode(plaintext);

  // Deserialize and validate
  const credentials = deserializeCredentials(json);

  if (!Array.isArray(credentials)) {
    throw new Error('Invalid backup content: expected array of credentials');
  }

  // Validate each credential
  for (let i = 0; i < credentials.length; i++) {
    const errors = validateCredential(credentials[i]);
    if (errors) {
      throw new Error(`Invalid credential at index ${i}: ${errors.join(', ')}`);
    }
  }

  return credentials;
}

/**
 * Merge imported credentials with existing ones.
 * Skips duplicates (by ID), returns merge statistics.
 */
export function mergeCredentials(
  existing: unknown[],
  imported: unknown[]
): { merged: unknown[]; added: number; skipped: number } {
  const existingIds = new Set(
    (existing as Array<{ id: string }>).map((c) => c.id)
  );

  let added = 0;
  let skipped = 0;

  const merged = [...existing];

  for (const cred of imported as Array<{ id: string }>) {
    if (existingIds.has(cred.id)) {
      skipped++;
    } else {
      merged.push(cred);
      existingIds.add(cred.id);
      added++;
    }
  }

  return { merged, added, skipped };
}
