/**
 * @midnight-cloak/contracts
 *
 * Compact smart contracts for Midnight Cloak identity verification.
 *
 * Contracts:
 * - age-verifier: Proves user meets minimum age without revealing birthdate
 * - credential-registry: Stores credential commitments on-chain
 *
 * After compilation, import the generated TypeScript APIs from:
 * - ./managed/age-verifier/contract
 * - ./managed/credential-registry/contract
 */

// Re-export witnesses
export * from './age-verifier-witnesses.js';
export * from './credential-registry-witnesses.js';

// Contract addresses (populated after deployment)
export const CONTRACT_ADDRESSES = {
  preprod: {
    ageVerifier: '',
    credentialRegistry: '',
  },
  mainnet: {
    ageVerifier: '',
    credentialRegistry: '',
  },
} as const;

export type Network = keyof typeof CONTRACT_ADDRESSES;

/**
 * Get contract addresses for a specific network
 */
export function getContractAddresses(network: Network) {
  return CONTRACT_ADDRESSES[network];
}

/**
 * Check if contracts are deployed on a network
 */
export function areContractsDeployed(network: Network): boolean {
  const addresses = CONTRACT_ADDRESSES[network];
  return addresses.ageVerifier !== '' && addresses.credentialRegistry !== '';
}

/**
 * Verification status enum
 */
export enum VerificationStatus {
  PENDING = 'PENDING',
  VERIFIED = 'VERIFIED',
  DENIED = 'DENIED',
}

/**
 * Credential status enum (mirrors Compact enum)
 */
export enum CredentialStatus {
  ACTIVE = 0,
  REVOKED = 1,
}

/**
 * Credential type enum (mirrors Compact enum)
 */
export enum CredentialType {
  AGE = 0,
  TOKEN_BALANCE = 1,
  NFT_OWNERSHIP = 2,
  RESIDENCY = 3,
  ACCREDITED = 4,
  CUSTOM = 5,
}

/**
 * Network configuration for Midnight networks
 */
export const NETWORK_CONFIG = {
  preprod: {
    indexer: 'https://indexer.preprod.midnight.network/api/v3/graphql',
    indexerWS: 'wss://indexer.preprod.midnight.network/api/v3/graphql/ws',
    node: 'https://rpc.preprod.midnight.network',
    proofServer: 'http://127.0.0.1:6300',
    faucet: 'https://faucet.preprod.midnight.network',
    explorer: 'https://preprod.midnightexplorer.io',
  },
  mainnet: {
    indexer: '', // TBD
    indexerWS: '', // TBD
    node: '', // TBD
    proofServer: '', // TBD
    faucet: '', // N/A for mainnet
    explorer: '', // TBD
  },
} as const;

/**
 * Get network configuration
 */
export function getNetworkConfig(network: Network) {
  return NETWORK_CONFIG[network];
}
