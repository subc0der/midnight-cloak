/**
 * @maskid/contracts
 * Contract types and interfaces for MaskID on Midnight
 *
 * IMPORTANT: This is a placeholder package.
 *
 * Real contract integration will require:
 * 1. Official Midnight contract examples (we do NOT write Compact code)
 * 2. Testnet access with tDUST
 * 3. ZK expertise for any circuit modifications
 *
 * See CLAUDE.md "Compact Language Policy" for details.
 */

// Contract addresses (to be updated after deployment to Midnight network)
export const CONTRACT_ADDRESSES = {
  testnet: {
    credentialRegistry: '',
    ageVerifier: '',
  },
  mainnet: {
    credentialRegistry: '',
    ageVerifier: '',
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
 * Currently returns false - no contracts deployed yet
 */
export function areContractsDeployed(_network: Network): boolean {
  return false;
}

/**
 * Verification status enum (for type compatibility)
 */
export enum VerificationStatus {
  PENDING = 'PENDING',
  VERIFIED = 'VERIFIED',
  DENIED = 'DENIED',
}

/**
 * Credential status enum (for type compatibility)
 */
export enum CredentialStatus {
  ACTIVE = 'ACTIVE',
  REVOKED = 'REVOKED',
}
