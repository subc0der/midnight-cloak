/**
 * WalletConnector - Interface for connecting to Midnight wallets (Lace, NuFi, etc.)
 *
 * Midnight uses a DApp Connector API similar to CIP-30 but with extensions
 * for privacy-preserving operations and ZK proof signing.
 *
 * Primary wallet: Lace Midnight (Chrome extension)
 */

import type { WalletType, Network } from './types';

export interface WalletInfo {
  name: string;
  icon: string;
  version: string;
  apiVersion: string;
}

export interface ConnectedWallet {
  getNetworkId(): Promise<string>;
  getAddress(): Promise<string>;
  getShieldedAddress?(): Promise<string>;
  getDustAddress?(): Promise<string>;
  signData(address: string, payload: string): Promise<string>;
  submitTx(tx: string): Promise<string>;
}

export interface WalletConnectorConfig {
  preferredWallet?: WalletType;
  autoConnect?: boolean;
  onConnect?: (wallet: ConnectedWallet) => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
}

/**
 * Midnight network identifiers
 * These are string-based unlike Cardano's numeric network IDs
 */
export const NETWORK_IDS = {
  mainnet: 'mainnet',
  preprod: 'preprod',
  standalone: 'undeployed',
} as const;

// Wallet identifiers in window.cardano (Midnight uses same extension point)
const WALLET_KEYS: Record<WalletType, string> = {
  lace: 'lace',
  nufi: 'nufi',
  vespr: 'vespr',
} as const;

/**
 * CIP-30 Wallet Provider interface
 * https://cips.cardano.org/cips/cip30/
 */
interface CIP30WalletProvider {
  name: string;
  icon?: string;
  version?: string;
  apiVersion: string;
  enable: () => Promise<CIP30WalletAPI>;
  isEnabled: () => Promise<boolean>;
}

interface CIP30WalletAPI {
  getNetworkId?: () => Promise<number>;
  getUsedAddresses?: () => Promise<string[]>;
  getUnusedAddresses?: () => Promise<string[]>;
  getChangeAddress?: () => Promise<string>;
  getRewardAddresses?: () => Promise<string[]>;
  signData?: (address: string, payload: string) => Promise<{ signature: string; key?: string }>;
  signTx?: (tx: string, partialSign?: boolean) => Promise<string>;
  submitTx?: (tx: string) => Promise<string>;
  getUtxos?: () => Promise<string[] | null>;
  getCollateral?: () => Promise<string[] | null>;
  getBalance?: () => Promise<string>;
}

interface CardanoWindow {
  [key: string]: CIP30WalletProvider | undefined;
}

declare global {
  interface Window {
    cardano?: CardanoWindow;
  }
}

export class WalletConnector {
  private config: WalletConnectorConfig;
  private connectedWallet: ConnectedWallet | null = null;

  constructor(config: WalletConnectorConfig = {}) {
    this.config = config;
  }

  /**
   * Get list of available wallets installed in the browser
   */
  getAvailableWallets(): WalletInfo[] {
    if (typeof window === 'undefined' || !window.cardano) {
      return [];
    }

    const wallets: WalletInfo[] = [];

    for (const [_key, wallet] of Object.entries(window.cardano)) {
      if (wallet && 'name' in wallet && 'apiVersion' in wallet) {
        wallets.push({
          name: wallet.name,
          icon: wallet.icon || '',
          version: wallet.version || '1.0.0',
          apiVersion: wallet.apiVersion,
        });
      }
    }

    return wallets;
  }

  /**
   * Check if a specific wallet is available
   */
  isWalletAvailable(wallet: WalletType): boolean {
    if (typeof window === 'undefined' || !window.cardano) return false;
    return !!window.cardano[WALLET_KEYS[wallet]];
  }

  /**
   * Check if Lace wallet is installed
   */
  isLaceAvailable(): boolean {
    return this.isWalletAvailable('lace');
  }

  /**
   * Connect to a wallet
   */
  async connect(walletKey?: WalletType): Promise<ConnectedWallet> {
    if (typeof window === 'undefined') {
      throw new Error('Wallet connection requires a browser environment');
    }

    if (!window.cardano) {
      throw new Error('No Cardano/Midnight wallet detected. Please install Lace wallet.');
    }

    const key = walletKey || this.config.preferredWallet || 'lace';
    const walletProvider = window.cardano[WALLET_KEYS[key]];

    if (!walletProvider) {
      throw new Error(`${key} wallet not found. Please install it from the browser extension store.`);
    }

    try {
      // Request wallet connection (CIP-30 enable)
      const api = await walletProvider.enable();

      // Wrap the API in our interface
      this.connectedWallet = this.wrapWalletApi(api);

      this.config.onConnect?.(this.connectedWallet);

      return this.connectedWallet;
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Failed to connect to wallet');
      this.config.onError?.(err);
      throw err;
    }
  }

  /**
   * Disconnect from wallet
   */
  disconnect(): void {
    this.connectedWallet = null;
    this.config.onDisconnect?.();
  }

  /**
   * Check if currently connected
   */
  isConnected(): boolean {
    return this.connectedWallet !== null;
  }

  /**
   * Get current connection
   */
  getConnection(): ConnectedWallet | null {
    return this.connectedWallet;
  }

  /**
   * Get the current network
   */
  async getNetwork(): Promise<Network> {
    if (!this.connectedWallet) {
      throw new Error('Wallet not connected');
    }

    const networkId = await this.connectedWallet.getNetworkId();
    if (networkId === NETWORK_IDS.mainnet) return 'mainnet';
    if (networkId === NETWORK_IDS.standalone) return 'standalone';
    return 'preprod';
  }

  private wrapWalletApi(api: CIP30WalletAPI): ConnectedWallet {
    return {
      getNetworkId: async () => {
        if (api.getNetworkId) {
          const id = await api.getNetworkId();
          // Convert numeric ID to string network ID for Midnight
          return id === 1 ? NETWORK_IDS.mainnet : NETWORK_IDS.preprod;
        }
        return NETWORK_IDS.preprod; // Default to preprod
      },

      getAddress: async (): Promise<string> => {
        if (api.getUsedAddresses) {
          const addresses = await api.getUsedAddresses();
          const firstAddress = addresses[0];
          if (firstAddress) {
            return firstAddress;
          }
        }
        if (api.getChangeAddress) {
          return api.getChangeAddress();
        }
        throw new Error('Could not retrieve wallet address');
      },

      signData: async (address: string, payload: string) => {
        if (!api.signData) {
          throw new Error('Wallet does not support data signing');
        }
        const result = await api.signData(address, payload);
        return result.signature;
      },

      submitTx: async (tx: string) => {
        if (!api.submitTx) {
          throw new Error('Wallet does not support transaction submission');
        }
        return api.submitTx(tx);
      },
    };
  }
}

/**
 * Create a mock wallet for development/testing
 */
export function createMockWallet(options: {
  network?: Network;
  address?: string;
  autoApprove?: boolean;
} = {}): ConnectedWallet {
  const network = options.network || 'preprod';
  // Use Midnight-style address format for mock
  const address = options.address || 'mn_addr_preprod1mock_address_for_development_testing_only';
  const networkId = network === 'mainnet' ? NETWORK_IDS.mainnet :
                    network === 'standalone' ? NETWORK_IDS.standalone :
                    NETWORK_IDS.preprod;

  return {
    getNetworkId: async () => networkId,
    getAddress: async () => address,
    signData: async (_address: string, payload: string) => {
      // Simulate signing delay
      await new Promise((resolve) => setTimeout(resolve, 500));
      // Return mock signature using browser-native TextEncoder and btoa
      // Use chunked conversion to avoid stack overflow on large payloads
      // ChunkSize of 4096 is safe across all major JS engines
      const encoder = new TextEncoder();
      const bytes = encoder.encode(payload);
      let binary = '';
      const chunkSize = 4096;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
        binary += String.fromCharCode(...chunk);
      }
      const base64 = btoa(binary).slice(0, 32);
      return `mock_sig_${base64}`;
    },
    submitTx: async (_tx: string) => {
      // Simulate transaction delay
      await new Promise((resolve) => setTimeout(resolve, 1000));
      // Return mock tx hash
      return `mock_tx_${Date.now().toString(16)}`;
    },
  };
}
