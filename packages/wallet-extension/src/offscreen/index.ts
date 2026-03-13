/**
 * Offscreen document for computations requiring DOM/WASM
 *
 * This runs in an offscreen document context where:
 * - WASM is allowed (service workers have CSP restrictions)
 * - DOM APIs like `document` are available (SDK compatibility)
 *
 * Handles:
 * - Argon2id key derivation
 * - Midnight SDK ZK proof generation
 */

import { argon2id } from 'hash-wasm';

// Argon2 parameters (OWASP recommended minimums)
const ARGON2_MEMORY = 65536; // 64 MB
const ARGON2_ITERATIONS = 3;
const ARGON2_PARALLELISM = 1;
const ARGON2_HASH_LENGTH = 32; // 256 bits for AES-256

// === Message Types ===

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

interface ServiceUris {
  proverServerUri: string;
  indexerUri: string;
  indexerWsUri: string;
  substrateNodeUri: string;
}

interface GenerateProofMessage {
  type: 'GENERATE_AGE_PROOF';
  serviceUris: ServiceUris;
  birthYear: number;
  minAge: number;
  currentYear: number;
}

interface GenerateProofResponse {
  type: 'GENERATE_AGE_PROOF_RESULT';
  success: boolean;
  proof?: number[]; // Array of bytes
  isVerified?: boolean;
  isMock: boolean;
  error?: string;
}

// === Proof Generation State ===

let proofProviderInitialized = false;
let zkConfigProvider: unknown = null;
let proofProvider: unknown = null;

// Listen for messages from the service worker
chrome.runtime.onMessage.addListener(
  (message: DeriveKeyMessage | GenerateProofMessage, _sender, sendResponse) => {
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

      return true;
    }

    if (message.type === 'GENERATE_AGE_PROOF') {
      generateAgeProof(message)
        .then((result) => {
          const response: GenerateProofResponse = {
            type: 'GENERATE_AGE_PROOF_RESULT',
            success: true,
            proof: result.proof,
            isVerified: result.isVerified,
            isMock: result.isMock,
          };
          sendResponse(response);
        })
        .catch((err) => {
          const response: GenerateProofResponse = {
            type: 'GENERATE_AGE_PROOF_RESULT',
            success: false,
            isMock: true,
            error: (err as Error).message,
          };
          sendResponse(response);
        });

      return true;
    }
  }
);

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

// === Proof Generation ===

/**
 * Get the URL where circuit assets are hosted.
 *
 * For real ZK proof generation, circuit files (ZKIR, prover keys) must be
 * served over HTTP/HTTPS. The Midnight SDK doesn't support chrome-extension:// URLs.
 *
 * Development Setup:
 * 1. Run the demo app: `cd apps/demo && pnpm dev`
 * 2. Demo app serves circuits at http://localhost:5173/circuits/age-verifier/
 * 3. Extension automatically uses this URL for proof generation
 *
 * Production Setup:
 * - Set CIRCUIT_ASSETS_URL at build time, OR
 * - Host circuits on a CDN and configure localStorage override
 */
function getCircuitAssetsUrl(): string | null {
  // Check for environment variable (set during build)
  // @ts-expect-error - injected at build time
  if (typeof CIRCUIT_ASSETS_URL !== 'undefined' && CIRCUIT_ASSETS_URL) {
    // @ts-expect-error - injected at build time
    return CIRCUIT_ASSETS_URL;
  }

  // Check localStorage for development/production override
  const override = localStorage.getItem('MIDNIGHT_CLOAK_CIRCUIT_URL');
  if (override) {
    return override;
  }

  // Development default: demo app serves circuits
  // The demo app (apps/demo) copies circuit files to its public directory
  // and serves them via Vite dev server with CORS enabled
  const devUrl = 'http://localhost:5173/circuits/age-verifier/';
  console.log('[Offscreen] Using development circuit URL:', devUrl);
  return devUrl;
}

async function initializeProofProvider(serviceUris: ServiceUris): Promise<void> {
  if (proofProviderInitialized && proofProvider) {
    console.log('[Offscreen] Proof provider already initialized');
    return;
  }

  console.log('[Offscreen] Initializing Midnight SDK proof provider...');
  console.log('[Offscreen] Prover server URI:', serviceUris.proverServerUri);

  // Get circuit assets URL
  const circuitUrl = getCircuitAssetsUrl();

  if (!circuitUrl) {
    console.warn('[Offscreen] No circuit assets URL configured.');
    console.warn('[Offscreen] Real ZK proofs require circuit files hosted over HTTPS.');
    console.warn('[Offscreen] Set localStorage "MIDNIGHT_CLOAK_CIRCUIT_URL" for development.');
    throw new Error(
      'Circuit assets URL not configured. ' +
      'Real ZK proofs require circuits hosted over HTTPS. ' +
      'For development, use mock proofs or configure MIDNIGHT_CLOAK_CIRCUIT_URL.'
    );
  }

  try {
    // Dynamic imports work in offscreen document (has DOM context)
    const [zkConfigModule, proofProviderModule] = await Promise.all([
      import('@midnight-ntwrk/midnight-js-fetch-zk-config-provider'),
      import('@midnight-ntwrk/midnight-js-http-client-proof-provider'),
    ]);

    const { FetchZkConfigProvider } = zkConfigModule;
    const { httpClientProofProvider } = proofProviderModule;

    console.log('[Offscreen] Using circuit assets URL:', circuitUrl);

    // Create ZK config provider for loading circuit keys
    zkConfigProvider = new FetchZkConfigProvider<'verifyAge'>(circuitUrl, fetch.bind(window));

    // Create HTTP client proof provider
    proofProvider = httpClientProofProvider(serviceUris.proverServerUri, zkConfigProvider);

    proofProviderInitialized = true;
    console.log('[Offscreen] Midnight SDK initialized successfully');
  } catch (error) {
    console.error('[Offscreen] Failed to initialize Midnight SDK:', error);
    throw error;
  }
}

interface ProofResult {
  proof: number[];
  isVerified: boolean;
  isMock: boolean;
}

async function generateAgeProof(message: GenerateProofMessage): Promise<ProofResult> {
  const { serviceUris, birthYear, minAge, currentYear } = message;

  // Calculate verification locally (proof server result is authoritative)
  const age = currentYear - birthYear;
  const isVerified = age >= minAge;

  console.log('[Offscreen] Generating age proof...');
  console.log('[Offscreen] Public inputs:', { minAge, currentYear });

  try {
    // Initialize if needed
    await initializeProofProvider(serviceUris);

    if (!proofProvider) {
      throw new Error('Proof provider not initialized');
    }

    // Generate proof using SDK
    const provider = proofProvider as {
      prove: (circuit: string, inputs: unknown) => Promise<{ proof: Uint8Array }>;
    };

    const proofResult = await provider.prove('verifyAge', {
      privateInput: {
        birthYear: BigInt(birthYear),
      },
      publicInput: {
        minAge: BigInt(minAge),
        currentYear: BigInt(currentYear),
      },
    });

    console.log('[Offscreen] Proof generated successfully!');

    return {
      proof: Array.from(proofResult.proof),
      isVerified,
      isMock: false,
    };
  } catch (error) {
    console.error('[Offscreen] Proof generation failed:', error);
    throw error;
  }
}

console.log('[Offscreen] Offscreen document ready (with proof generation support)');
