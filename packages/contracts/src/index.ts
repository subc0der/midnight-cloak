/**
 * @maskid/contracts
 * Compact smart contracts for MaskID on Midnight
 *
 * This package contains the Compact contract source files and exports
 * compiled contract bindings and deployment addresses.
 *
 * ## Contract Files
 *
 * - `credential-registry.compact` - Main registry for credential management
 * - `age-verifier.compact` - Zero-knowledge age verification circuit
 *
 * ## Compilation
 *
 * To compile contracts, you need the Compact compiler installed:
 * ```bash
 * npm install -g @midnight-ntwrk/compact-compiler
 * ```
 *
 * Then compile each contract:
 * ```bash
 * npx compactc src/credential-registry.compact
 * npx compactc src/age-verifier.compact
 * ```
 *
 * This generates `.cjs` files that can be imported into the SDK.
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
 */
export function areContractsDeployed(network: Network): boolean {
  const addresses = CONTRACT_ADDRESSES[network];
  return Object.values(addresses).every((addr) => addr.length > 0);
}

// Compiled contract modules are exported via package.json "exports" field:
//
// Age Verifier Contract:
//   import { Contract, ledger, VerificationStatus } from '@maskid/contracts/age-verifier'
//
// Credential Registry Contract:
//   import { Contract, ledger } from '@maskid/contracts/credential-registry'
//
// Each contract exports:
//   - Contract: The main contract class
//   - ledger(): Function to parse ledger state
//   - Witnesses: Type for witness functions (private inputs)
//   - Circuits: Type for circuit functions (ZK operations)
