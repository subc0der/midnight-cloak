/**
 * Offscreen document for Argon2 key derivation
 *
 * This runs in an offscreen document context where WASM is allowed.
 * The service worker cannot run WASM due to Manifest V3 CSP restrictions,
 * so we offload Argon2 computation here.
 */

import { argon2id } from 'hash-wasm';

// Argon2 parameters (OWASP recommended minimums)
const ARGON2_MEMORY = 65536; // 64 MB
const ARGON2_ITERATIONS = 3;
const ARGON2_PARALLELISM = 1;
const ARGON2_HASH_LENGTH = 32; // 256 bits for AES-256

interface DeriveKeyMessage {
  type: 'DERIVE_KEY';
  password: string;
  salt: number[]; // Array of bytes
}

interface DeriveKeyResponse {
  type: 'DERIVE_KEY_RESULT';
  success: boolean;
  keyBytes?: number[]; // Array of bytes
  error?: string;
}

// Listen for messages from the service worker
chrome.runtime.onMessage.addListener((message: DeriveKeyMessage, _sender, sendResponse) => {
  if (message.type === 'DERIVE_KEY') {
    deriveKey(message.password, message.salt)
      .then((keyBytes) => {
        const response: DeriveKeyResponse = {
          type: 'DERIVE_KEY_RESULT',
          success: true,
          keyBytes: Array.from(keyBytes),
        };
        sendResponse(response);
      })
      .catch((err) => {
        const response: DeriveKeyResponse = {
          type: 'DERIVE_KEY_RESULT',
          success: false,
          error: (err as Error).message,
        };
        sendResponse(response);
      });

    // Return true to indicate async response
    return true;
  }
});

async function deriveKey(password: string, saltArray: number[]): Promise<Uint8Array> {
  const salt = new Uint8Array(saltArray);

  console.log('[Offscreen] Deriving key with Argon2id...');
  console.log('[Offscreen] Salt (first 4 bytes):', Array.from(salt.slice(0, 4)));

  const hashHex = await argon2id({
    password,
    salt,
    memorySize: ARGON2_MEMORY,
    iterations: ARGON2_ITERATIONS,
    parallelism: ARGON2_PARALLELISM,
    hashLength: ARGON2_HASH_LENGTH,
    outputType: 'hex',
  });

  console.log('[Offscreen] Key derived successfully');

  // Convert hex string to Uint8Array
  const keyBytes = new Uint8Array(
    hashHex.match(/.{2}/g)!.map((byte: string) => parseInt(byte, 16))
  );

  return keyBytes;
}

console.log('[Offscreen] Offscreen document ready');
