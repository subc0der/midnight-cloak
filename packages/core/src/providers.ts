/**
 * Midnight Provider Configuration
 *
 * This module provides the infrastructure for connecting to Midnight networks
 * and interacting with smart contracts. Based on official Midnight patterns
 * from example-counter and example-bboard.
 *
 * Providers handle:
 * - Proof generation (via proof server)
 * - Public data queries (via indexer)
 * - Private state storage (via LevelDB or in-memory)
 * - ZK circuit configuration (Node via file, Browser via fetch)
 * - Wallet operations
 *
 * Browser vs Node.js:
 * - Node.js uses NodeZkConfigProvider (file system access)
 * - Browser uses FetchZkConfigProvider (HTTP fetch for circuit assets)
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

// ─────────────────────────────────────────────────────────────────────────────
// Browser Provider Support (FetchZkConfigProvider pattern)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Service configuration returned by Lace wallet's serviceUriConfig()
 * These URIs point to the user's connected network infrastructure
 */
export interface LaceServiceConfig {
  /** Proof server URI for ZK proof generation */
  proverServerUri: string;
  /** Indexer HTTP endpoint for GraphQL queries */
  indexerUri: string;
  /** Indexer WebSocket endpoint for subscriptions */
  indexerWsUri: string;
  /** RPC node endpoint for transaction submission */
  nodeUri: string;
  /** Network identifier (e.g., 'preprod', 'mainnet') */
  networkId: string;
}

/**
 * Configuration for browser-based Midnight providers
 */
export interface BrowserProvidersConfig {
  /** Base URL for circuit assets (e.g., window.location.origin + '/circuits/') */
  circuitBaseUrl: string;
  /** Service configuration from Lace wallet or manual config */
  serviceConfig: LaceServiceConfig;
  /** Contract name for ZK config lookup (e.g., 'age-verifier') */
  contractName: string;
}

/**
 * Browser-compatible provider set for Midnight contract interaction
 * Uses FetchZkConfigProvider instead of NodeZkConfigProvider
 */
export interface BrowserProviders {
  /** ZK config provider using fetch for circuit assets */
  zkConfigProvider: unknown;
  /** Proof provider communicating with proof server */
  proofProvider: unknown;
  /** Public data provider for indexer queries */
  publicDataProvider: unknown;
  /** Whether providers are fully initialized */
  initialized: boolean;
}

/**
 * Get Lace wallet service configuration
 *
 * Finds Lace wallet in window.midnight and retrieves service URIs
 * for the connected network.
 *
 * @returns Service configuration or null if Lace not available
 *
 * @example
 * ```typescript
 * const serviceConfig = await getLaceServiceConfig();
 * if (serviceConfig) {
 *   console.log('Proof server:', serviceConfig.proverServerUri);
 * }
 * ```
 */
export async function getLaceServiceConfig(): Promise<LaceServiceConfig | null> {
  // Check if we're in a browser environment
  if (typeof window === 'undefined') {
    return null;
  }

  // Find Lace wallet in window.midnight
  // Note: Lace is registered with a UUID key, so we search by name
  const midnight = (window as unknown as { midnight?: Record<string, unknown> }).midnight;
  if (!midnight) {
    return null;
  }

  const lace = Object.values(midnight).find(
    (wallet): wallet is { name: string; serviceUriConfig: () => Promise<LaceServiceConfig> } =>
      typeof wallet === 'object' &&
      wallet !== null &&
      'name' in wallet &&
      (wallet as { name: unknown }).name === 'lace' &&
      'serviceUriConfig' in wallet
  );

  if (!lace) {
    return null;
  }

  try {
    return await lace.serviceUriConfig();
  } catch {
    return null;
  }
}

/**
 * Create browser-compatible providers for contract interaction
 *
 * This function creates providers using FetchZkConfigProvider which
 * loads circuit assets via HTTP fetch rather than file system.
 *
 * @param config - Browser provider configuration
 * @returns Provider set for contract interaction
 *
 * @example
 * ```typescript
 * const serviceConfig = await getLaceServiceConfig();
 * if (!serviceConfig) throw new Error('Lace not connected');
 *
 * const providers = await createBrowserProviders({
 *   circuitBaseUrl: window.location.origin + '/circuits/',
 *   serviceConfig,
 *   contractName: 'age-verifier',
 * });
 * ```
 */
export async function createBrowserProviders(
  config: BrowserProvidersConfig
): Promise<BrowserProviders> {
  // Dynamic import to avoid bundling issues in non-browser environments
  // and to prevent service worker crashes from static WASM imports
  const [
    { FetchZkConfigProvider },
    { httpClientProofProvider },
    { indexerPublicDataProvider },
  ] = await Promise.all([
    import('@midnight-ntwrk/midnight-js-fetch-zk-config-provider'),
    import('@midnight-ntwrk/midnight-js-http-client-proof-provider'),
    import('@midnight-ntwrk/midnight-js-indexer-public-data-provider'),
  ]);

  // Create ZK config provider that fetches circuit assets via HTTP
  // The URL should point to where circuit files (keys/, zkir/) are hosted
  const zkConfigUrl = config.circuitBaseUrl.endsWith('/')
    ? config.circuitBaseUrl + config.contractName
    : config.circuitBaseUrl + '/' + config.contractName;

  const zkConfigProvider = new FetchZkConfigProvider(zkConfigUrl, fetch.bind(globalThis));

  // Create proof provider that communicates with the proof server
  const proofProvider = httpClientProofProvider(
    config.serviceConfig.proverServerUri,
    zkConfigProvider
  );

  // Create public data provider for indexer queries
  const publicDataProvider = indexerPublicDataProvider(
    config.serviceConfig.indexerUri,
    config.serviceConfig.indexerWsUri
  );

  return {
    zkConfigProvider,
    proofProvider,
    publicDataProvider,
    initialized: true,
  };
}

/**
 * Create a network config from Lace service configuration
 *
 * Useful when you want to use SDK methods that expect NetworkConfig
 * but you have Lace service URIs.
 *
 * @param serviceConfig - Service configuration from Lace
 * @returns NetworkConfig compatible object
 */
export function networkConfigFromLace(serviceConfig: LaceServiceConfig): NetworkConfig {
  return {
    network: serviceConfig.networkId as 'preprod' | 'mainnet' | 'standalone',
    networkId: serviceConfig.networkId,
    indexer: serviceConfig.indexerUri,
    indexerWS: serviceConfig.indexerWsUri,
    node: serviceConfig.nodeUri,
    proofServer: serviceConfig.proverServerUri,
  };
}

/**
 * Check if FetchZkConfigProvider is available (browser environment)
 */
export function isBrowserEnvironment(): boolean {
  return typeof window !== 'undefined' && typeof fetch === 'function';
}

/**
 * Extended ProviderFactory with browser support
 */
export class BrowserProviderFactory extends ProviderFactory {
  private serviceConfig: LaceServiceConfig | null = null;

  /**
   * Initialize with Lace service configuration
   * @returns true if Lace config was loaded, false otherwise
   */
  async initializeFromLace(): Promise<boolean> {
    this.serviceConfig = await getLaceServiceConfig();
    return this.serviceConfig !== null;
  }

  /**
   * Set service configuration manually (for testing or non-Lace wallets)
   */
  setServiceConfig(config: LaceServiceConfig): void {
    this.serviceConfig = config;
  }

  /**
   * Get the current service configuration
   */
  getServiceConfig(): LaceServiceConfig | null {
    return this.serviceConfig;
  }

  /**
   * Create browser providers for a specific contract
   *
   * @param contractName - Name of the contract (e.g., 'age-verifier')
   * @param circuitBaseUrl - Base URL where circuit assets are hosted
   * @throws Error if service config not initialized
   */
  async createBrowserProvidersForContract(
    contractName: string,
    circuitBaseUrl: string
  ): Promise<BrowserProviders> {
    if (!this.serviceConfig) {
      throw new Error(
        'Service config not initialized. Call initializeFromLace() or setServiceConfig() first.'
      );
    }

    return createBrowserProviders({
      circuitBaseUrl,
      serviceConfig: this.serviceConfig,
      contractName,
    });
  }

  /**
   * Override proof server availability check to use Lace config
   */
  override async isProofServerAvailable(): Promise<boolean> {
    const proofServerUrl = this.serviceConfig?.proverServerUri ?? this.getConfig().proofServer;
    try {
      const response = await fetch(`${proofServerUrl}/version`);
      return response.ok;
    } catch {
      return false;
    }
  }
}
