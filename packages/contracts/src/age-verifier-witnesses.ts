/**
 * Age Verifier Witnesses
 *
 * Provides private data to the age verification circuit.
 * These functions run off-chain and supply data that never appears on-chain.
 */

// WitnessContext type (from @midnight-ntwrk/compact-runtime)
// Defined locally to avoid dependency until compilation
interface WitnessContext<Ledger, PrivateState> {
  ledger: Ledger;
  privateState: PrivateState;
  contractAddress: string;
}

// Type for the compiled contract's ledger (will be generated after compilation)
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface AgeVerifierLedger {}

/**
 * Private state stored locally in the user's wallet/browser
 * Contains sensitive data that should never be transmitted
 */
export interface AgeVerifierPrivateState {
  /** User's birth year (e.g., 1990) */
  readonly birthYear: number;
}

/**
 * Create initial private state for age verification
 * Called when setting up the contract for a user
 */
export function createAgeVerifierPrivateState(
  birthYear: number
): AgeVerifierPrivateState {
  if (birthYear < 1900 || birthYear > new Date().getFullYear()) {
    throw new Error(`Invalid birth year: ${birthYear}`);
  }
  return { birthYear };
}

/**
 * Witness implementations for the age verifier contract
 *
 * Each witness function:
 * 1. Receives WitnessContext with ledger, privateState, contractAddress
 * 2. Returns tuple of [newPrivateState, returnValue]
 */
export const ageVerifierWitnesses = {
  /**
   * Returns the user's birth year from private state
   * This value is used in the ZK circuit but never revealed on-chain
   */
  getBirthYear: ({
    privateState,
  }: WitnessContext<
    AgeVerifierLedger,
    AgeVerifierPrivateState
  >): [AgeVerifierPrivateState, bigint] => {
    return [privateState, BigInt(privateState.birthYear)];
  },

  /**
   * Returns the current year
   * Using a witness allows the year to come from a trusted source
   * rather than being hardcoded in the contract
   */
  getCurrentYear: ({
    privateState,
  }: WitnessContext<
    AgeVerifierLedger,
    AgeVerifierPrivateState
  >): [AgeVerifierPrivateState, bigint] => {
    const currentYear = new Date().getFullYear();
    return [privateState, BigInt(currentYear)];
  },
};

export type AgeVerifierWitnesses = typeof ageVerifierWitnesses;
