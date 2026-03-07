// Type definitions for Midnight Cloak deployment CLI
// Based on example-counter patterns

import type { MidnightProviders } from '@midnight-ntwrk/midnight-js-types';
import type { DeployedContract, FoundContract } from '@midnight-ntwrk/midnight-js-contracts';
import type { ImpureCircuitId } from '@midnight-ntwrk/compact-js';

// Import contract types from managed directories
import type * as AgeVerifierTypes from '../../contracts/src/managed/age-verifier/contract/index.js';
import type * as CredentialRegistryTypes from '../../contracts/src/managed/credential-registry/contract/index.js';

// ─── Age Verifier Types ─────────────────────────────────────────────────────

export interface AgeVerifierPrivateState {
  birthYear: number;
  currentYear: number;
}

export type AgeVerifierCircuits = ImpureCircuitId<AgeVerifierTypes.Contract<AgeVerifierPrivateState>>;

export const AgeVerifierPrivateStateId = 'ageVerifierPrivateState' as const;

export type AgeVerifierProviders = MidnightProviders<
  AgeVerifierCircuits,
  typeof AgeVerifierPrivateStateId,
  AgeVerifierPrivateState
>;

export type DeployedAgeVerifierContract =
  | DeployedContract<AgeVerifierTypes.Contract<AgeVerifierPrivateState>>
  | FoundContract<AgeVerifierTypes.Contract<AgeVerifierPrivateState>>;

// ─── Credential Registry Types ──────────────────────────────────────────────

export interface CredentialRegistryPrivateState {
  secretKey: Uint8Array;
}

export type CredentialRegistryCircuits = ImpureCircuitId<CredentialRegistryTypes.Contract<CredentialRegistryPrivateState>>;

export const CredentialRegistryPrivateStateId = 'credentialRegistryPrivateState' as const;

export type CredentialRegistryProviders = MidnightProviders<
  CredentialRegistryCircuits,
  typeof CredentialRegistryPrivateStateId,
  CredentialRegistryPrivateState
>;

export type DeployedCredentialRegistryContract =
  | DeployedContract<CredentialRegistryTypes.Contract<CredentialRegistryPrivateState>>
  | FoundContract<CredentialRegistryTypes.Contract<CredentialRegistryPrivateState>>;
