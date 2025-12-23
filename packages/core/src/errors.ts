/**
 * Custom error classes for MaskID SDK
 *
 * All SDK errors extend MaskIDError and include an error code
 * for programmatic error handling.
 *
 * @example
 * ```typescript
 * try {
 *   await client.verify({ type: 'AGE', policy: { minAge: 18 } });
 * } catch (error) {
 *   if (isMaskIDError(error)) {
 *     console.log(`Error ${error.code}: ${error.message}`);
 *   }
 * }
 * ```
 */

/**
 * Error codes used throughout the SDK.
 * Use these for programmatic error handling.
 */
export const ErrorCodes = {
  WALLET_NOT_CONNECTED: 'E001',
  VERIFICATION_DENIED: 'E002',
  VERIFICATION_TIMEOUT: 'E003',
  INVALID_POLICY: 'E004',
  CREDENTIAL_NOT_FOUND: 'E005',
  PROOF_GENERATION_FAILED: 'E006',
  NETWORK_ERROR: 'E007',
  CONTRACT_ERROR: 'E008',
  UNSUPPORTED_VERIFICATION_TYPE: 'E009',
  WALLET_ERROR: 'E010',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

export class MaskIDError extends Error {
  public readonly code: string;
  public readonly details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'MaskIDError';
    this.code = code;
    this.details = details;
  }
}

/** Thrown when user denies a verification request in their wallet */
export class VerificationDeniedError extends MaskIDError {
  constructor(message = 'User denied verification request') {
    super(ErrorCodes.VERIFICATION_DENIED, message);
    this.name = 'VerificationDeniedError';
  }
}

/** Thrown when a verification request times out */
export class VerificationTimeoutError extends MaskIDError {
  constructor(message = 'Verification request timed out') {
    super(ErrorCodes.VERIFICATION_TIMEOUT, message);
    this.name = 'VerificationTimeoutError';
  }
}

/** Thrown when attempting operations that require a connected wallet */
export class WalletNotConnectedError extends MaskIDError {
  constructor(message = 'No wallet connected') {
    super(ErrorCodes.WALLET_NOT_CONNECTED, message);
    this.name = 'WalletNotConnectedError';
  }
}

/** Thrown when a network operation fails */
export class NetworkError extends MaskIDError {
  constructor(message = 'Network error occurred', details?: unknown) {
    super(ErrorCodes.NETWORK_ERROR, message, details);
    this.name = 'NetworkError';
  }
}

/** Thrown when a policy configuration is invalid */
export class InvalidPolicyError extends MaskIDError {
  constructor(message = 'Invalid policy configuration', details?: unknown) {
    super(ErrorCodes.INVALID_POLICY, message, details);
    this.name = 'InvalidPolicyError';
  }
}

/** Thrown when a required credential is not found in the user's wallet */
export class CredentialNotFoundError extends MaskIDError {
  constructor(message = 'Required credential not found') {
    super(ErrorCodes.CREDENTIAL_NOT_FOUND, message);
    this.name = 'CredentialNotFoundError';
  }
}

/** Thrown when ZK proof generation fails */
export class ProofGenerationError extends MaskIDError {
  constructor(message = 'Failed to generate proof', details?: unknown) {
    super(ErrorCodes.PROOF_GENERATION_FAILED, message, details);
    this.name = 'ProofGenerationError';
  }
}

/** Thrown when a smart contract operation fails */
export class ContractError extends MaskIDError {
  constructor(message = 'Smart contract error', details?: unknown) {
    super(ErrorCodes.CONTRACT_ERROR, message, details);
    this.name = 'ContractError';
  }
}

/** Thrown when an unsupported verification type is requested */
export class UnsupportedVerificationTypeError extends MaskIDError {
  constructor(type: string) {
    super(ErrorCodes.UNSUPPORTED_VERIFICATION_TYPE, `Verification type '${type}' is not yet implemented`);
    this.name = 'UnsupportedVerificationTypeError';
  }
}

/** Thrown when a wallet operation fails */
export class WalletError extends MaskIDError {
  constructor(message = 'Wallet operation failed', details?: unknown) {
    super(ErrorCodes.WALLET_ERROR, message, details);
    this.name = 'WalletError';
  }
}

/**
 * Type guard to check if an error is a MaskIDError
 *
 * @param error - The error to check
 * @returns true if the error is a MaskIDError instance
 *
 * @example
 * ```typescript
 * catch (error) {
 *   if (isMaskIDError(error)) {
 *     // TypeScript knows error is MaskIDError here
 *     handleError(error.code, error.message);
 *   }
 * }
 * ```
 */
export function isMaskIDError(error: unknown): error is MaskIDError {
  return error instanceof MaskIDError;
}

/**
 * Type guard to check if an error has a specific error code
 *
 * @param error - The error to check
 * @param code - The error code to match
 * @returns true if the error is a MaskIDError with the specified code
 */
export function hasErrorCode(error: unknown, code: ErrorCode): boolean {
  return isMaskIDError(error) && error.code === code;
}
