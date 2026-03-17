/**
 * Network configuration for Midnight Cloak SDK
 *
 * Based on official Midnight patterns from example-counter.
 */

import type { Network } from './types';

/**
 * Configuration interface for Midnight network connections
 */
export interface NetworkConfig {
  readonly network: Network;
  readonly networkId: string;
  readonly indexer: string;
  readonly indexerWS: string;
  readonly node: string;
  readonly proofServer: string;
}

/**
 * Extended client configuration with SDK-specific options
 */
export interface MidnightCloakConfig extends NetworkConfig {
  readonly apiKey?: string;
  readonly timeout?: number;
  readonly zkConfigPath?: string;
}

/**
 * Preprod network configuration
 * This is the recommended network for development and testing.
 */
export class PreprodConfig implements NetworkConfig {
  readonly network: Network = 'preprod';
  readonly networkId = 'preprod';
  readonly indexer = 'https://indexer.preprod.midnight.network/api/v3/graphql';
  readonly indexerWS = 'wss://indexer.preprod.midnight.network/api/v3/graphql/ws';
  readonly node = 'https://rpc.preprod.midnight.network';
  readonly proofServer = 'http://127.0.0.1:6300';
}

/**
 * Standalone network configuration
 * For fully local development using Docker (node + indexer + proof server).
 */
export class StandaloneConfig implements NetworkConfig {
  readonly network: Network = 'standalone';
  readonly networkId = 'undeployed';
  readonly indexer = 'http://127.0.0.1:8088/api/v3/graphql';
  readonly indexerWS = 'ws://127.0.0.1:8088/api/v3/graphql/ws';
  readonly node = 'http://127.0.0.1:9944';
  readonly proofServer = 'http://127.0.0.1:6300';
}

/**
 * Mainnet configuration
 *
 * Midnight mainnet launches late March 2026 (Kūkolu federated mainnet phase).
 *
 * NOTE: These URLs are placeholders based on expected patterns.
 * Update with actual URLs once mainnet launches and endpoints are published.
 *
 * For production use:
 * 1. Verify endpoints against official Midnight documentation
 * 2. Use production-grade proof server (not localhost)
 * 3. Ensure DUST tokens are available for transactions
 *
 * See: https://docs.midnight.network for latest mainnet configuration
 */
export class MainnetConfig implements NetworkConfig {
  readonly network: Network = 'mainnet';
  readonly networkId = 'mainnet';
  // Expected mainnet endpoints (verify after launch)
  readonly indexer = 'https://indexer.midnight.network/api/v3/graphql';
  readonly indexerWS = 'wss://indexer.midnight.network/api/v3/graphql/ws';
  readonly node = 'https://rpc.midnight.network';
  // Proof server: Production deployments should use hosted proof server
  // For now, defaults to localhost - update when production URLs available
  readonly proofServer = 'http://127.0.0.1:6300';
}

/**
 * Create a network configuration based on network name
 */
export function createNetworkConfig(network: Network): NetworkConfig {
  switch (network) {
    case 'preprod':
      return new PreprodConfig();
    case 'standalone':
      return new StandaloneConfig();
    case 'mainnet':
      return new MainnetConfig();
    default:
      throw new Error(`Unknown network: ${network}`);
  }
}

/**
 * Indexer client connection configuration
 * Used by wallet SDK and contract providers
 */
export interface IndexerClientConnection {
  indexerHttpUrl: string;
  indexerWsUrl: string;
}

/**
 * Create indexer connection config from network config
 */
export function createIndexerConnection(config: NetworkConfig): IndexerClientConnection {
  return {
    indexerHttpUrl: config.indexer,
    indexerWsUrl: config.indexerWS,
  };
}

/**
 * Proof server URL configuration
 */
export function createProofServerUrl(config: NetworkConfig): URL {
  return new URL(config.proofServer);
}

/**
 * Relay URL for WebSocket connections to the node
 */
export function createRelayUrl(config: NetworkConfig): URL {
  return new URL(config.node.replace(/^http/, 'ws'));
}
