// Type definitions for Midnight Cloak deployment CLI
// Based on example-counter patterns

import type { MidnightProviders, AnyProvableCircuitId } from '@midnight-ntwrk/midnight-js-types';
import type { DeployedContract, FoundContract } from '@midnight-ntwrk/midnight-js-contracts';

// Note: Contract type imports removed - using 'any' until contracts are recompiled for Ledger v8
// When recompiling, restore these imports and use proper types:
// import type * as AgeVerifierTypes from '../../contracts/src/managed/age-verifier/contract/index.js';
// import type * as CredentialRegistryTypes from '../../contracts/src/managed/credential-registry/contract/index.js';

// ─── Age Verifier Types ─────────────────────────────────────────────────────

export interface AgeVerifierPrivateState {
  birthYear: number;
  currentYear: number;
}

// Use string type for circuit IDs (compatible with Ledger v8)
export type AgeVerifierCircuits = 'verifyAge';

export const AgeVerifierPrivateStateId = 'ageVerifierPrivateState' as const;

export type AgeVerifierProviders = MidnightProviders<
  AnyProvableCircuitId,
  typeof AgeVerifierPrivateStateId,
  AgeVerifierPrivateState
>;

// Use 'any' for contract types until contracts are recompiled for Ledger v8
export type DeployedAgeVerifierContract = DeployedContract<any> | FoundContract<any>;

// ─── Credential Registry Types ──────────────────────────────────────────────

export interface CredentialRegistryPrivateState {
  secretKey: Uint8Array;
}

// Use string type for circuit IDs (compatible with Ledger v8)
export type CredentialRegistryCircuits = 'registerCredential' | 'checkCommitment';

export const CredentialRegistryPrivateStateId = 'credentialRegistryPrivateState' as const;

export type CredentialRegistryProviders = MidnightProviders<
  AnyProvableCircuitId,
  typeof CredentialRegistryPrivateStateId,
  CredentialRegistryPrivateState
>;

// Use 'any' for contract types until contracts are recompiled for Ledger v8
export type DeployedCredentialRegistryContract = DeployedContract<any> | FoundContract<any>;
