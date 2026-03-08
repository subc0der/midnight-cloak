/**
 * Credential Registry Witnesses
 *
 * Provides private data to the credential registry circuit.
 * These functions run off-chain and supply data that never appears on-chain.
 */

// WitnessContext type (from @midnight-ntwrk/compact-runtime)
// Defined locally to avoid dependency until compilation
interface WitnessContext<Ledger, PrivateState> {
  ledger: Ledger;
  privateState: PrivateState;
  contractAddress: string;
}

/**
 * Type for the contract's ledger state
 * Matches the exported ledger fields in credential-registry.compact
 *
 * Note: registeredCommitments (Set<Bytes<32>>) is not directly readable
 * from witnesses - use checkCommitment circuit instead
 */
export interface CredentialRegistryLedger {
  readonly totalCredentials: bigint;
  readonly round: bigint;
}

/**
 * Private state for credential registry operations
 */
export interface CredentialRegistryPrivateState {
  /** Caller's secret key (32 bytes) */
  readonly secretKey: Uint8Array;
}

/**
 * Create initial private state for credential registry operations
 *
 * @param secretKey - Caller's secret key (must be exactly 32 bytes, non-zero)
 * @throws Error if secretKey is invalid
 */
export function createCredentialRegistryPrivateState(
  secretKey: Uint8Array
): CredentialRegistryPrivateState {
  // Validate byte length
  if (secretKey.length !== 32) {
    throw new Error(`Secret key must be 32 bytes, got ${secretKey.length}`);
  }

  // Validate non-zero (all-zero key is cryptographically weak)
  if (secretKey.every((byte) => byte === 0)) {
    throw new Error('Secret key cannot be all zeros');
  }

  return { secretKey };
}

/**
 * Witness implementations for the credential registry contract
 *
 * Each witness function:
 * 1. Receives WitnessContext with ledger, privateState, contractAddress
 * 2. Returns tuple of [newPrivateState, returnValue]
 */
export const credentialRegistryWitnesses = {
  /**
   * Returns the caller's secret key for authentication
   *
   * The secret key is used in the ZK circuit to derive the public key
   * but is never revealed on-chain - only the derived public key is disclosed.
   */
  getSecretKey: ({
    privateState,
  }: WitnessContext<
    CredentialRegistryLedger,
    CredentialRegistryPrivateState
  >): [CredentialRegistryPrivateState, Uint8Array] => {
    const secretKey = privateState.secretKey;

    // Defensive validation - should have been validated at state creation
    if (secretKey.length !== 32) {
      throw new Error(
        `Invalid secret key length in private state: ${secretKey.length}`
      );
    }
    if (secretKey.every((byte) => byte === 0)) {
      throw new Error('Invalid secret key in private state: all zeros');
    }

    return [privateState, secretKey];
  },
};

export type CredentialRegistryWitnesses = typeof credentialRegistryWitnesses;
