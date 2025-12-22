/**
 * WalletConnector - Interface for connecting to Midnight wallets (Lace, NuFi, etc.)
 * Implements CIP-30 compatible DApp Connector API for Midnight
 */

import type { WalletType } from './types';

export interface WalletInfo {
  name: string;
  icon: string;
  version: string;
  apiVersion: string;
}

export interface ConnectedWallet {
  getNetworkId(): Promise<number>;
  getAddress(): Promise<string>;
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

// Midnight network IDs
export const NETWORK_IDS = {
  mainnet: 1,
  testnet: 0,
} as const;

// Wallet identifiers in window.cardano
const WALLET_KEYS: Record<WalletType, string> = {
  lace: 'lace',
  nami: 'nami',
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
   * Get the current network (testnet/mainnet)
   */
  async getNetwork(): Promise<'testnet' | 'mainnet'> {
    if (!this.connectedWallet) {
      throw new Error('Wallet not connected');
    }

    const networkId = await this.connectedWallet.getNetworkId();
    return networkId === NETWORK_IDS.mainnet ? 'mainnet' : 'testnet';
  }

  private wrapWalletApi(api: CIP30WalletAPI): ConnectedWallet {
    return {
      getNetworkId: async () => {
        if (api.getNetworkId) {
          return api.getNetworkId();
        }
        return NETWORK_IDS.testnet; // Default to testnet
      },

      getAddress: async (): Promise<string> => {
        if (api.getUsedAddresses) {
          const addresses = await api.getUsedAddresses();
          if (addresses.length > 0) {
            return addresses[0]!;
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
  network?: 'testnet' | 'mainnet';
  address?: string;
  autoApprove?: boolean;
} = {}): ConnectedWallet {
  const network = options.network || 'testnet';
  const address = options.address || 'addr_test1qz2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3jcu5d8ps7zex2k2xt3uqxgjqnnj83ws8lhrn648jjxtwq2ytjqp';

  return {
    getNetworkId: async () => NETWORK_IDS[network],
    getAddress: async () => address,
    signData: async (_address: string, payload: string) => {
      // Simulate signing delay
      await new Promise((resolve) => setTimeout(resolve, 500));
      // Return mock signature (use browser-native btoa for base64)
      const encoded = typeof btoa === 'function'
        ? btoa(unescape(encodeURIComponent(payload))).slice(0, 32)
        : Buffer.from(payload).toString('base64').slice(0, 32);
      return `mock_sig_${encoded}`;
    },
    submitTx: async (_tx: string) => {
      // Simulate transaction delay
      await new Promise((resolve) => setTimeout(resolve, 1000));
      // Return mock tx hash
      return `mock_tx_${Date.now().toString(16)}`;
    },
  };
}
