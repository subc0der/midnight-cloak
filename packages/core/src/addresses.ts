/**
 * Deployed contract addresses for Midnight Cloak
 *
 * These are the official contract addresses deployed on each network.
 * SDK users connect to these contracts rather than deploying their own.
 */

import type { Network } from './types';

/**
 * Contract addresses for a specific network
 */
export interface NetworkContracts {
  /** Age Verifier contract address */
  ageVerifier: string;
  /** Credential Registry contract address */
  credentialRegistry: string;
}

/**
 * Contract addresses by network
 */
export const CONTRACT_ADDRESSES: Record<Network, NetworkContracts | null> = {
  /**
   * Preprod testnet contracts
   * Deployed: March 2026
   */
  preprod: {
    ageVerifier: '11ad42b6f40f17a24bfd0d9a2410c11cfe83041459592800ff77773dee22c639',
    credentialRegistry: '9c11690461447fc0ad72ad90ac2fda7574aebe294a7a0d2c3e7c8369f947609d',
  },

  /**
   * Standalone (local Docker) contracts
   * Users must deploy their own contracts on local network
   */
  standalone: null,

  /**
   * Mainnet contracts
   * Will be populated after mainnet launch (late March 2026)
   */
  mainnet: null,
};

/**
 * Get contract addresses for a network
 * @throws Error if no contracts are deployed on the network
 */
export function getContractAddresses(network: Network): NetworkContracts {
  const addresses = CONTRACT_ADDRESSES[network];
  if (!addresses) {
    throw new Error(
      `No contracts deployed on ${network}. ` +
        (network === 'standalone'
          ? 'Use the deploy-cli to deploy contracts locally.'
          : 'Contracts will be available after mainnet launch.')
    );
  }
  return addresses;
}

/**
 * Check if contracts are deployed on a network
 */
export function hasDeployedContracts(network: Network): boolean {
  return CONTRACT_ADDRESSES[network] !== null;
}
