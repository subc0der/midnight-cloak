/**
 * Page API for Midnight Cloak extension
 *
 * This script runs in the page context (not content script context)
 * and provides window.midnightCloak API for dApps.
 */

// Make this a module so declare global works
export {};

const PAGE_API_EXTENSION_ID = 'midnight-cloak';

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

window.midnightCloak = {
  isInstalled: true,
  version: '0.1.0',

  async requestVerification(config: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const handler = (event: MessageEvent) => {
        if (
          event.data?.source === PAGE_API_EXTENSION_ID &&
          event.data?.type === 'VERIFICATION_REQUEST_RESPONSE'
        ) {
          window.removeEventListener('message', handler);
          const payload = event.data.payload;
          if (payload.success) {
            resolve(payload);
          } else {
            reject(new Error(payload.error || 'Verification failed'));
          }
        }
      };

      window.addEventListener('message', handler);

      window.postMessage(
        {
          type: 'VERIFICATION_REQUEST',
          source: 'midnight-cloak-dapp',
          payload: {
            policyConfig: config,
            origin: window.location.origin,
          },
        },
        '*'
      );

      // Timeout after 5 minutes
      setTimeout(() => {
        window.removeEventListener('message', handler);
        reject(new Error('Verification request timed out'));
      }, 5 * 60 * 1000);
    });
  },

  async getAvailableCredentials(): Promise<unknown[]> {
    return new Promise((resolve, reject) => {
      const handler = (event: MessageEvent) => {
        if (
          event.data?.source === PAGE_API_EXTENSION_ID &&
          event.data?.type === 'GET_AVAILABLE_CREDENTIALS_RESPONSE'
        ) {
          window.removeEventListener('message', handler);
          const payload = event.data.payload;
          if (payload.success) {
            resolve(payload.credentials);
          } else {
            reject(new Error(payload.error || 'Failed to get credentials'));
          }
        }
      };

      window.addEventListener('message', handler);

      window.postMessage(
        {
          type: 'GET_AVAILABLE_CREDENTIALS',
          source: 'midnight-cloak-dapp',
          payload: {},
        },
        '*'
      );

      setTimeout(() => {
        window.removeEventListener('message', handler);
        reject(new Error('Request timed out'));
      }, 30000);
    });
  },

  async issueCredential(credential: {
    type: string;
    claims: Record<string, unknown>;
    issuer: string;
    expiresAt?: number | null;
  }): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const handler = (event: MessageEvent) => {
        if (
          event.data?.source === PAGE_API_EXTENSION_ID &&
          event.data?.type === 'CREDENTIAL_OFFER_RESPONSE'
        ) {
          window.removeEventListener('message', handler);
          const payload = event.data.payload;
          if (payload.success) {
            resolve(payload);
          } else {
            reject(new Error(payload.error || 'Credential issuance failed'));
          }
        }
      };

      window.addEventListener('message', handler);

      window.postMessage(
        {
          type: 'CREDENTIAL_OFFER',
          source: 'midnight-cloak-dapp',
          payload: {
            credential: {
              ...credential,
              expiresAt: credential.expiresAt ?? null,
            },
            origin: window.location.origin,
          },
        },
        '*'
      );

      // Timeout after 5 minutes
      setTimeout(() => {
        window.removeEventListener('message', handler);
        reject(new Error('Credential offer timed out'));
      }, 5 * 60 * 1000);
    });
  },

  isLaceAvailable(): boolean {
    // Lace Midnight registers in window.midnight with UUID keys
    // Find wallet by name property
    if (!window.midnight) return false;
    const wallets = Object.values(window.midnight) as MidnightWalletAnnouncement[];
    return wallets.some(w => w.name === 'lace');
  },

  async getLaceServiceUris(): Promise<LaceConfiguration | null> {
    if (!window.midnight) {
      console.log('[MidnightCloak] window.midnight not available');
      return null;
    }

    // Find Lace wallet by name (registered with UUID key)
    const wallets = Object.values(window.midnight) as MidnightWalletAnnouncement[];
    const lace = wallets.find(w => w.name === 'lace');

    if (!lace) {
      console.log('[MidnightCloak] Lace wallet not found in window.midnight');
      return null;
    }

    try {
      // Connect to wallet with network ID (triggers authorization popup if needed)
      console.log('[MidnightCloak] Connecting to Lace Midnight wallet...');
      const api = await lace.connect('preprod');

      // Get configuration including service URIs
      const config = await api.getConfiguration();
      console.log('[MidnightCloak] Got Lace configuration:', config);

      return config;
    } catch (error) {
      console.error('[MidnightCloak] Failed to get Lace service URIs:', error);
      return null;
    }
  },
};

// Dispatch event to notify dApps that extension is ready
window.dispatchEvent(new CustomEvent('midnightCloakReady'));
