/**
 * @maskid/contracts
 * Compact smart contracts for MaskID on Midnight
 *
 * This package exports the compiled contract bindings and addresses.
 * Contract source files are in .compact format.
 */

// Contract addresses (to be updated after deployment)
export const CONTRACT_ADDRESSES = {
  testnet: {
    credentialRegistry: '',
    verificationEngine: '',
    policyEvaluator: '',
    issuerRegistry: '',
  },
  mainnet: {
    credentialRegistry: '',
    verificationEngine: '',
    policyEvaluator: '',
    issuerRegistry: '',
  },
} as const;

// Re-export compiled contract bindings when available
// export * from './credential-registry.cjs';
// export * from './verification-engine.cjs';
