/**
 * Age Verifier Witnesses
 *
 * Provides private data to the age verification circuit.
 * These functions run off-chain and supply data that never appears on-chain.
 *
 * SECURITY NOTE - Client-Side Time (MVP Limitation):
 * The getCurrentYear witness uses the client's system clock (new Date().getFullYear()).
 * A malicious user could manipulate their system time to affect verification.
 *
 * For production use, consider:
 * 1. Passing currentYear as a public circuit parameter from a trusted backend
 * 2. Using a time oracle that provides signed timestamps
 * 3. Adding a server-side verification layer
 *
 * The contract has underflow guards, so time manipulation can only cause:
 * - False negatives (failing verification for legitimate users) if time is set to past
 * - False positives (passing verification for underage) if time is set to future
 *
 * This is acceptable for MVP/testnet but must be addressed before mainnet.
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

// Reasonable bounds for validation
const MIN_VALID_BIRTH_YEAR = 1900;
const MAX_VALID_AGE = 150; // No one is older than 150 years

/**
 * Create initial private state for age verification
 * Called when setting up the contract for a user
 *
 * @param birthYear - User's birth year (must be between 1900 and current year)
 * @throws Error if birthYear is invalid or represents an impossible age
 */
export function createAgeVerifierPrivateState(
  birthYear: number
): AgeVerifierPrivateState {
  const currentYear = new Date().getFullYear();

  // Validate birth year is a reasonable integer
  if (!Number.isInteger(birthYear)) {
    throw new Error(`Birth year must be an integer, got: ${birthYear}`);
  }

  // Birth year cannot be in the future
  if (birthYear > currentYear) {
    throw new Error(
      `Birth year cannot be in the future: ${birthYear} > ${currentYear}`
    );
  }

  // Birth year must be within reasonable historical bounds
  if (birthYear < MIN_VALID_BIRTH_YEAR) {
    throw new Error(
      `Birth year too old: ${birthYear} < ${MIN_VALID_BIRTH_YEAR}`
    );
  }

  // Age must be physically possible
  const age = currentYear - birthYear;
  if (age > MAX_VALID_AGE) {
    throw new Error(
      `Calculated age ${age} exceeds maximum valid age of ${MAX_VALID_AGE}`
    );
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
   *
   * The contract has underflow guards, but we validate here as defense in depth.
   */
  getBirthYear: ({
    privateState,
  }: WitnessContext<
    AgeVerifierLedger,
    AgeVerifierPrivateState
  >): [AgeVerifierPrivateState, bigint] => {
    const birthYear = privateState.birthYear;

    // Defensive validation - should have been validated at state creation
    if (
      !Number.isInteger(birthYear) ||
      birthYear < MIN_VALID_BIRTH_YEAR ||
      birthYear > new Date().getFullYear()
    ) {
      throw new Error(`Invalid birth year in private state: ${birthYear}`);
    }

    return [privateState, BigInt(birthYear)];
  },

  /**
   * Returns the current year from system clock
   *
   * SECURITY NOTE: This uses the client's local system time.
   * See file header for security implications and production recommendations.
   *
   * Validation ensures the year is within reasonable bounds to catch
   * obvious manipulation (though sophisticated attacks could still work).
   */
  getCurrentYear: ({
    privateState,
  }: WitnessContext<
    AgeVerifierLedger,
    AgeVerifierPrivateState
  >): [AgeVerifierPrivateState, bigint] => {
    const currentYear = new Date().getFullYear();

    // Basic sanity check - year should be reasonable
    // This catches obvious system clock issues but not sophisticated manipulation
    if (currentYear < 2020 || currentYear > 2100) {
      throw new Error(
        `System clock appears incorrect: year ${currentYear} is outside valid range 2020-2100`
      );
    }

    return [privateState, BigInt(currentYear)];
  },
};

export type AgeVerifierWitnesses = typeof ageVerifierWitnesses;
