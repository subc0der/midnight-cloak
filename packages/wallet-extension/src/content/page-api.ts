/**
 * Page API for Midnight Cloak extension
 *
 * This script runs in the page context (not content script context)
 * and provides window.midnightCloak API for dApps.
 *
 * Security features:
 * - Request correlation IDs prevent response spoofing
 * - postMessage restricted to same origin
 * - Wallet discovery uses rdns (harder to spoof than name)
 */

// Make this a module so declare global works
export {};

const PAGE_API_EXTENSION_ID = 'midnight-cloak';
const DAPP_SOURCE = 'midnight-cloak-dapp';

// Lace Midnight's reverse domain name identifier
const LACE_MIDNIGHT_RDNS = 'io.lace.midnight';

/**
 * Generate a unique request ID for correlation
 */
function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Lace Midnight wallet announcement in window.midnight registry.
 * Wallets register with UUID keys and provide metadata + connect method.
 */
interface MidnightWalletAnnouncement {
  name: string;
  apiVersion: string;
  icon: string;
  rdns: string;
  connect: (networkId: string) => Promise<LaceConnectedApi>;
}

/**
 * Connected Lace wallet API returned by connect()
 */
interface LaceConnectedApi {
  getConfiguration: () => Promise<LaceConfiguration>;
  getUnshieldedBalances: () => Promise<unknown>;
  getShieldedBalances: () => Promise<unknown>;
  getDustBalance: () => Promise<unknown>;
  balanceUnsealedTransaction: (tx: unknown) => Promise<unknown>;
  submitTransaction: (tx: unknown) => Promise<unknown>;
  signData: (address: string, payload: string) => Promise<unknown>;
}

/**
 * Lace wallet configuration including service URIs
 */
interface LaceConfiguration {
  networkId: string;
  proverServerUri: string;
  indexerUri: string;
  indexerWsUri: string;
  substrateNodeUri: string;
}

/**
 * The window.midnight registry contains wallet announcements keyed by UUID
 */
interface MidnightWindow {
  [uuid: string]: MidnightWalletAnnouncement;
}

declare global {
  interface Window {
    midnight?: MidnightWindow;
    midnightCloak: {
      isInstalled: boolean;
      version: string;
      requestVerification: (config: unknown) => Promise<unknown>;
      getAvailableCredentials: () => Promise<unknown[]>;
      issueCredential: (credential: {
        type: string;
        claims: Record<string, unknown>;
        issuer: string;
        expiresAt?: number | null;
      }) => Promise<unknown>;
      isLaceAvailable: () => boolean;
      getLaceServiceUris: () => Promise<LaceConfiguration | null>;
    };
  }
}

/**
 * Send a request to the extension with correlation ID
 *
 * @param type - Message type
 * @param payload - Message payload
 * @param timeoutMs - Timeout in milliseconds
 * @returns Promise resolving to the response payload
 */
async function sendRequest<T>(
  type: string,
  payload: Record<string, unknown>,
  timeoutMs: number = 30000
): Promise<T> {
  const requestId = generateRequestId();

  return new Promise((resolve, reject) => {
    const handler = (event: MessageEvent) => {
      // Security: Verify message comes from same window/origin
      // This prevents cross-frame and cross-origin message injection
      if (event.source !== window || event.origin !== window.location.origin) {
        return;
      }

      // Verify response is from our extension and matches our request
      if (
        event.data?.source === PAGE_API_EXTENSION_ID &&
        event.data?.type === `${type}_RESPONSE` &&
        event.data?.requestId === requestId
      ) {
        window.removeEventListener('message', handler);
        const responsePayload = event.data.payload;

        if (responsePayload?.success) {
          resolve(responsePayload as T);
        } else {
          reject(new Error(responsePayload?.error || `${type} failed`));
        }
      }
    };

    window.addEventListener('message', handler);

    // Send request with correlation ID
    // Use window.location.origin instead of '*' to restrict to same origin
    window.postMessage(
      {
        type,
        source: DAPP_SOURCE,
        requestId,
        payload,
      },
      window.location.origin
    );

    // Timeout handler
    setTimeout(() => {
      window.removeEventListener('message', handler);
      reject(new Error(`${type} timed out`));
    }, timeoutMs);
  });
}

/**
 * Find Lace Midnight wallet in window.midnight registry
 * Uses rdns for more secure discovery (harder to spoof than name)
 */
function findLaceWallet(): MidnightWalletAnnouncement | null {
  if (!window.midnight) return null;

  // Filter to only valid wallet objects (defensive against malformed entries)
  const wallets = Object.values(window.midnight).filter(
    (w): w is MidnightWalletAnnouncement =>
      w !== null && typeof w === 'object' && 'connect' in w
  );

  // Primary: Find by rdns (more secure - harder to spoof)
  let lace = wallets.find(w => w.rdns === LACE_MIDNIGHT_RDNS);

  // Fallback: Find by name (for compatibility)
  if (!lace) {
    lace = wallets.find(w => w.name === 'lace');
    if (lace) {
      console.warn('[MidnightCloak] Found Lace by name, not rdns. Consider updating Lace extension.');
    }
  }

  return lace || null;
}

window.midnightCloak = {
  isInstalled: true,
  version: '0.1.0',

  async requestVerification(config: unknown): Promise<unknown> {
    // Get Lace service URIs for real proof generation
    // This allows the background script to initialize the ProofGenerator
    let serviceUris: LaceConfiguration | null = null;
    try {
      serviceUris = await this.getLaceServiceUris();
      if (serviceUris) {
        console.log('[MidnightCloak] Got Lace service URIs for proof generation');
      }
    } catch (err) {
      console.warn('[MidnightCloak] Could not get Lace URIs, proof generation may use mock:', err);
    }

    return sendRequest(
      'VERIFICATION_REQUEST',
      { policyConfig: config, serviceUris },
      5 * 60 * 1000 // 5 minutes for user interaction
    );
  },

  async getAvailableCredentials(): Promise<unknown[]> {
    const response = await sendRequest<{ credentials: unknown[] }>(
      'GET_AVAILABLE_CREDENTIALS',
      {},
      30000
    );
    return response.credentials;
  },

  async issueCredential(credential: {
    type: string;
    claims: Record<string, unknown>;
    issuer: string;
    expiresAt?: number | null;
  }): Promise<unknown> {
    return sendRequest(
      'CREDENTIAL_OFFER',
      {
        credential: {
          ...credential,
          expiresAt: credential.expiresAt ?? null,
        },
      },
      5 * 60 * 1000 // 5 minutes for user interaction
    );
  },

  isLaceAvailable(): boolean {
    return findLaceWallet() !== null;
  },

  /**
   * Get Midnight service URIs from Lace wallet.
   *
   * SECURITY NOTE: This exposes public infrastructure endpoints (prover server,
   * indexer, RPC node). This is intentional and safe because:
   * 1. These are PUBLIC endpoints documented in Midnight's official docs
   * 2. Same endpoints for all users on a given network (not user-specific)
   * 3. dApps require these URIs to interact with Midnight
   * 4. No private data (keys, addresses, credentials) is exposed
   *
   * We're simply passing through what Lace provides - not exposing secrets.
   */
  async getLaceServiceUris(): Promise<LaceConfiguration | null> {
    const lace = findLaceWallet();

    if (!lace) {
      console.log('[MidnightCloak] Lace Midnight wallet not found');
      return null;
    }

    try {
      // Connect to wallet with network ID (triggers authorization popup if needed)
      // Network is configurable via environment variable (defaults to preprod)
      const networkId =
        (typeof import.meta.env !== 'undefined' && import.meta.env.VITE_MIDNIGHT_NETWORK) ||
        'preprod';
      console.log('[MidnightCloak] Connecting to Lace Midnight wallet on network:', networkId);
      const api = await lace.connect(networkId);

      // Get configuration including service URIs
      const config = await api.getConfiguration();
      console.log('[MidnightCloak] Got Lace configuration for network:', config.networkId);

      return config;
    } catch (error) {
      console.error('[MidnightCloak] Failed to get Lace service URIs:', error);
      return null;
    }
  },
};

// Dispatch event to notify dApps that extension is ready
window.dispatchEvent(new CustomEvent('midnightCloakReady'));
