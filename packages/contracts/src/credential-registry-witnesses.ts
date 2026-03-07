/**
 * Credential Registry Witnesses
 *
 * Provides private data to the credential registry circuit.
 */

// WitnessContext type (from @midnight-ntwrk/compact-runtime)
interface WitnessContext<Ledger, PrivateState> {
  ledger: Ledger;
  privateState: PrivateState;
  contractAddress: string;
}

/**
 * Type for the contract's ledger state
 * Matches the exported ledger fields in credential-registry.compact
 */
export interface CredentialRegistryLedger {
  readonly totalCredentials: bigint;
  readonly round: bigint;
  readonly owner: Uint8Array;
}

/**
 * Private state for credential registry operations
 */
export interface CredentialRegistryPrivateState {
  /** Caller's secret key (32 bytes) */
  readonly secretKey: Uint8Array;
}

/**
 * Create initial private state
 */
export function createCredentialRegistryPrivateState(
  secretKey: Uint8Array
): CredentialRegistryPrivateState {
  if (secretKey.length !== 32) {
    throw new Error('Secret key must be 32 bytes');
  }
  return { secretKey };
}

/**
 * Witness implementations
 */
export const credentialRegistryWitnesses = {
  /**
   * Returns the caller's secret key for authentication
   */
  getSecretKey: ({
    privateState,
  }: WitnessContext<
    CredentialRegistryLedger,
    CredentialRegistryPrivateState
  >): [CredentialRegistryPrivateState, Uint8Array] => {
    return [privateState, privateState.secretKey];
  },
};

export type CredentialRegistryWitnesses = typeof credentialRegistryWitnesses;
