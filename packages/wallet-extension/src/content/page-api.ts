/**
 * Page API for Midnight Cloak extension
 *
 * This script runs in the page context (not content script context)
 * and provides window.midnightCloak API for dApps.
 */

// Make this a module so declare global works
export {};

const PAGE_API_EXTENSION_ID = 'midnight-cloak';

declare global {
  interface Window {
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
};

// Dispatch event to notify dApps that extension is ready
window.dispatchEvent(new CustomEvent('midnightCloakReady'));
