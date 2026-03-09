/**
 * Page API for Midnight Cloak extension
 *
 * This script runs in the page context (not content script context)
 * and provides window.midnightCloak API for dApps.
 */

const EXTENSION_ID = 'midnight-cloak';

declare global {
  interface Window {
    midnightCloak: {
      isInstalled: boolean;
      version: string;
      requestVerification: (config: unknown) => Promise<unknown>;
      getAvailableCredentials: () => Promise<unknown[]>;
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
          event.data?.source === EXTENSION_ID &&
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
          payload: config,
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
          event.data?.source === EXTENSION_ID &&
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
};

// Dispatch event to notify dApps that extension is ready
window.dispatchEvent(new CustomEvent('midnightCloakReady'));
