/**
 * Midnight Provider Configuration
 *
 * This module provides the infrastructure for connecting to Midnight networks
 * and interacting with smart contracts. Based on official Midnight patterns
 * from example-counter.
 *
 * Providers handle:
 * - Proof generation (via proof server)
 * - Public data queries (via indexer)
 * - Private state storage (via LevelDB)
 * - ZK circuit configuration
 * - Wallet operations
 */

import type { NetworkConfig } from './config';

// IndexerClientConnection is exported from config.ts
import type { IndexerClientConnection } from './config';

/**
 * Wallet context containing all wallet components
 * This is the result of building/restoring a wallet
 *
 * SECURITY: This context intentionally excludes the seed.
 * Seeds should only exist transiently during wallet creation/restoration
 * and should be handled/stored by the caller, never in long-lived contexts.
 */
export interface WalletContext {
  /** The unified wallet facade */
  wallet: unknown; // WalletFacade - typed as unknown until dependencies installed
  /** Shielded (ZSwap) secret keys */
  shieldedSecretKeys: unknown; // ledger.ZswapSecretKeys
  /** Dust wallet secret key */
  dustSecretKey: unknown; // ledger.DustSecretKey
  /** Unshielded wallet keystore */
  unshieldedKeystore: unknown; // UnshieldedKeystore
  /** Public identifier for the wallet (derived from seed, not the seed itself) */
  walletId: string;
}

/**
 * Configuration for the shielded wallet
 */
export interface ShieldedWalletConfig {
  networkId: string;
  indexerClientConnection: IndexerClientConnection;
  provingServerUrl: URL;
  relayURL: URL;
}

/**
 * Configuration for the unshielded wallet
 */
export interface UnshieldedWalletConfig {
  networkId: string;
  indexerClientConnection: IndexerClientConnection;
}

/**
 * Configuration for the dust wallet
 */
export interface DustWalletConfig {
  networkId: string;
  costParameters: {
    additionalFeeOverhead: bigint;
    feeBlocksMargin: number;
  };
  indexerClientConnection: IndexerClientConnection;
  provingServerUrl: URL;
  relayURL: URL;
}

/**
 * Build shielded wallet configuration from network config
 */
export function buildShieldedConfig(config: NetworkConfig): ShieldedWalletConfig {
  return {
    networkId: config.networkId,
    indexerClientConnection: {
      indexerHttpUrl: config.indexer,
      indexerWsUrl: config.indexerWS,
    },
    provingServerUrl: new URL(config.proofServer),
    relayURL: new URL(config.node.replace(/^http/, 'ws')),
  };
}

/**
 * Build unshielded wallet configuration from network config
 */
export function buildUnshieldedConfig(config: NetworkConfig): UnshieldedWalletConfig {
  return {
    networkId: config.networkId,
    indexerClientConnection: {
      indexerHttpUrl: config.indexer,
      indexerWsUrl: config.indexerWS,
    },
  };
}

/**
 * Build dust wallet configuration from network config
 */
export function buildDustConfig(config: NetworkConfig): DustWalletConfig {
  return {
    networkId: config.networkId,
    costParameters: {
      // Default fee overhead for Preprod - adjust for mainnet
      additionalFeeOverhead: 300_000_000_000_000n,
      feeBlocksMargin: 5,
    },
    indexerClientConnection: {
      indexerHttpUrl: config.indexer,
      indexerWsUrl: config.indexerWS,
    },
    provingServerUrl: new URL(config.proofServer),
    relayURL: new URL(config.node.replace(/^http/, 'ws')),
  };
}

/**
 * Provider factory for creating Midnight providers
 *
 * Usage:
 * ```typescript
 * const factory = new ProviderFactory(networkConfig);
 * const providers = await factory.createProviders(walletContext);
 * ```
 */
export class ProviderFactory {
  private config: NetworkConfig;

  constructor(config: NetworkConfig) {
    this.config = config;
  }

  /**
   * Get the network configuration
   */
  getConfig(): NetworkConfig {
    return this.config;
  }

  /**
   * Create indexer client connection
   */
  createIndexerConnection(): IndexerClientConnection {
    return {
      indexerHttpUrl: this.config.indexer,
      indexerWsUrl: this.config.indexerWS,
    };
  }

  /**
   * Create proof server URL
   */
  createProofServerUrl(): URL {
    return new URL(this.config.proofServer);
  }

  /**
   * Create relay URL for WebSocket connections
   */
  createRelayUrl(): URL {
    return new URL(this.config.node.replace(/^http/, 'ws'));
  }

  /**
   * Check if the proof server is available
   */
  async isProofServerAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.proofServer}/version`);
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Check if the indexer is available
   */
  async isIndexerAvailable(): Promise<boolean> {
    try {
      const response = await fetch(this.config.indexer, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: '{ __typename }' }),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Check if the node is available
   */
  async isNodeAvailable(): Promise<boolean> {
    try {
      const response = await fetch(this.config.node);
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Check all services availability
   */
  async checkServices(): Promise<{
    proofServer: boolean;
    indexer: boolean;
    node: boolean;
  }> {
    const [proofServer, indexer, node] = await Promise.all([
      this.isProofServerAvailable(),
      this.isIndexerAvailable(),
      this.isNodeAvailable(),
    ]);
    return { proofServer, indexer, node };
  }
}

/**
 * Format a token balance for display (e.g. 1000000000 -> "1,000,000,000")
 */
export function formatBalance(balance: bigint): string {
  return balance.toLocaleString();
}

/**
 * Convert bytes to hex string
 */
export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Convert hex string to bytes
 */
export function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}
