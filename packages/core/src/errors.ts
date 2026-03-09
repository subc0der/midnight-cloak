/**
 * Custom error classes for Midnight Cloak SDK
 *
 * All SDK errors extend MidnightCloakError and include an error code
 * for programmatic error handling.
 *
 * @example
 * ```typescript
 * try {
 *   await client.verify({ type: 'AGE', policy: { minAge: 18 } });
 * } catch (error) {
 *   if (isMidnightCloakError(error)) {
 *     console.log(`Error ${error.code}: ${error.message}`);
 *   }
 * }
 * ```
 */

/**
 * Semantic error codes used throughout the SDK.
 * Use these for programmatic error handling.
 *
 * @example
 * ```typescript
 * if (error.code === ErrorCodes.WALLET_NOT_CONNECTED) {
 *   // Prompt user to connect wallet
 * }
 * ```
 */
export const ErrorCodes = {
  WALLET_NOT_CONNECTED: 'WALLET_NOT_CONNECTED',
  VERIFICATION_DENIED: 'VERIFICATION_DENIED',
  VERIFICATION_TIMEOUT: 'VERIFICATION_TIMEOUT',
  INVALID_POLICY: 'INVALID_POLICY',
  CREDENTIAL_NOT_FOUND: 'CREDENTIAL_NOT_FOUND',
  PROOF_GENERATION_FAILED: 'PROOF_GENERATION_FAILED',
  NETWORK_ERROR: 'NETWORK_ERROR',
  CONTRACT_ERROR: 'CONTRACT_ERROR',
  UNSUPPORTED_VERIFICATION_TYPE: 'UNSUPPORTED_VERIFICATION_TYPE',
  WALLET_ERROR: 'WALLET_ERROR',
  NOT_INITIALIZED: 'NOT_INITIALIZED',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

export class MidnightCloakError extends Error {
  public readonly code: string;
  public readonly details?: unknown;

  constructor(code: string, message: string, details?: unknown, options?: { cause?: Error }) {
    super(message, options);
    this.name = 'MidnightCloakError';
    this.code = code;
    this.details = details;
  }

  /**
   * Serialize error for logging or transmission.
   */
  toJSON(): { name: string; code: string; message: string; details?: unknown } {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      ...(this.details !== undefined && { details: this.details }),
    };
  }

  /**
   * Wrap an existing error with SDK error context.
   *
   * @example
   * ```typescript
   * try {
   *   await riskyOperation();
   * } catch (error) {
   *   throw MidnightCloakError.wrap(ErrorCodes.NETWORK_ERROR, 'Connection failed', error);
   * }
   * ```
   */
  static wrap(code: string, message: string, cause: unknown): MidnightCloakError {
    const causeError = cause instanceof Error ? cause : new Error(String(cause));
    return new MidnightCloakError(code, message, undefined, { cause: causeError });
  }
}

/** Thrown when user denies a verification request in their wallet */
export class VerificationDeniedError extends MidnightCloakError {
  constructor(message = 'User denied verification request', options?: { cause?: Error }) {
    super(ErrorCodes.VERIFICATION_DENIED, message, undefined, options);
    this.name = 'VerificationDeniedError';
  }
}

/** Thrown when a verification request times out */
export class VerificationTimeoutError extends MidnightCloakError {
  constructor(message = 'Verification request timed out', options?: { cause?: Error }) {
    super(ErrorCodes.VERIFICATION_TIMEOUT, message, undefined, options);
    this.name = 'VerificationTimeoutError';
  }
}

/** Thrown when attempting operations that require a connected wallet */
export class WalletNotConnectedError extends MidnightCloakError {
  constructor(message = 'No wallet connected', options?: { cause?: Error }) {
    super(ErrorCodes.WALLET_NOT_CONNECTED, message, undefined, options);
    this.name = 'WalletNotConnectedError';
  }
}

/** Thrown when a network operation fails */
export class NetworkError extends MidnightCloakError {
  constructor(message = 'Network error occurred', details?: unknown, options?: { cause?: Error }) {
    super(ErrorCodes.NETWORK_ERROR, message, details, options);
    this.name = 'NetworkError';
  }
}

/** Thrown when a policy configuration is invalid */
export class InvalidPolicyError extends MidnightCloakError {
  constructor(message = 'Invalid policy configuration', details?: unknown, options?: { cause?: Error }) {
    super(ErrorCodes.INVALID_POLICY, message, details, options);
    this.name = 'InvalidPolicyError';
  }
}

/** Thrown when a required credential is not found in the user's wallet */
export class CredentialNotFoundError extends MidnightCloakError {
  constructor(message = 'Required credential not found', options?: { cause?: Error }) {
    super(ErrorCodes.CREDENTIAL_NOT_FOUND, message, undefined, options);
    this.name = 'CredentialNotFoundError';
  }
}

/** Thrown when ZK proof generation fails */
export class ProofGenerationError extends MidnightCloakError {
  constructor(message = 'Failed to generate proof', details?: unknown, options?: { cause?: Error }) {
    super(ErrorCodes.PROOF_GENERATION_FAILED, message, details, options);
    this.name = 'ProofGenerationError';
  }
}

/** Thrown when a smart contract operation fails */
export class ContractError extends MidnightCloakError {
  constructor(message = 'Smart contract error', details?: unknown, options?: { cause?: Error }) {
    super(ErrorCodes.CONTRACT_ERROR, message, details, options);
    this.name = 'ContractError';
  }
}

/** Thrown when an unsupported verification type is requested */
export class UnsupportedVerificationTypeError extends MidnightCloakError {
  constructor(type: string, options?: { cause?: Error }) {
    super(ErrorCodes.UNSUPPORTED_VERIFICATION_TYPE, `Verification type '${type}' is not yet implemented`, undefined, options);
    this.name = 'UnsupportedVerificationTypeError';
  }
}

/** Thrown when a wallet operation fails */
export class WalletError extends MidnightCloakError {
  constructor(message = 'Wallet operation failed', details?: unknown, options?: { cause?: Error }) {
    super(ErrorCodes.WALLET_ERROR, message, details, options);
    this.name = 'WalletError';
  }
}

/** Thrown when an operation requires initialization that hasn't been performed */
export class NotInitializedError extends MidnightCloakError {
  constructor(component: string, options?: { cause?: Error }) {
    super(ErrorCodes.NOT_INITIALIZED, `${component} not initialized. Call initialize() first.`, undefined, options);
    this.name = 'NotInitializedError';
  }
}

/**
 * Type guard to check if an error is a MidnightCloakError
 *
 * @param error - The error to check
 * @returns true if the error is a MidnightCloakError instance
 *
 * @example
 * ```typescript
 * catch (error) {
 *   if (isMidnightCloakError(error)) {
 *     // TypeScript knows error is MidnightCloakError here
 *     handleError(error.code, error.message);
 *   }
 * }
 * ```
 */
export function isMidnightCloakError(error: unknown): error is MidnightCloakError {
  return error instanceof MidnightCloakError;
}

/**
 * Type guard to check if an error has a specific error code
 *
 * @param error - The error to check
 * @param code - The error code to match
 * @returns true if the error is a MidnightCloakError with the specified code
 */
export function hasErrorCode(error: unknown, code: ErrorCode): boolean {
  return isMidnightCloakError(error) && error.code === code;
}

/**
 * Known phrases that indicate user rejection of a wallet operation.
 * These are common patterns from various wallet implementations.
 */
const USER_REJECTION_PHRASES = [
  'user denied',
  'user rejected',
  'user cancelled',
  'request rejected',
  'transaction declined',
] as const;

/**
 * Exact matches that indicate user rejection (for short error messages).
 */
const USER_REJECTION_EXACT = ['denied', 'rejected', 'cancelled'] as const;

/**
 * Determine if an error message indicates user rejection of a wallet operation.
 * This handles various error message formats from different wallet implementations.
 *
 * @param message - The error message to check
 * @returns true if the error appears to be a user rejection
 *
 * @example
 * ```typescript
 * const isRejection = isUserRejectionError(error.message);
 * const code = isRejection ? ErrorCodes.VERIFICATION_DENIED : ErrorCodes.WALLET_ERROR;
 * ```
 */
export function isUserRejectionError(message: string): boolean {
  const lowerMessage = message.toLowerCase();

  // Check for exact matches (short messages like "denied")
  if (USER_REJECTION_EXACT.some((phrase) => lowerMessage === phrase)) {
    return true;
  }

  // Check for phrase matches (e.g., "user denied request")
  return USER_REJECTION_PHRASES.some((phrase) => lowerMessage.includes(phrase));
}

/**
 * Determine the appropriate error code based on an error message.
 * Useful for mapping wallet errors to SDK error codes.
 *
 * @param message - The error message to analyze
 * @returns VERIFICATION_DENIED if user rejected, WALLET_ERROR otherwise
 */
export function getWalletErrorCode(message: string): ErrorCode {
  return isUserRejectionError(message)
    ? ErrorCodes.VERIFICATION_DENIED
    : ErrorCodes.WALLET_ERROR;
}

/**
 * Actionable error guidance for user-facing error messages.
 * Provides user-friendly descriptions and next steps.
 */
export interface ErrorGuidance {
  /** User-friendly error title */
  title: string;
  /** User-friendly error description */
  description: string;
  /** Actionable next steps the user can take */
  actions: ErrorAction[];
}

export interface ErrorAction {
  /** Label for the action */
  label: string;
  /** URL to open (optional) */
  url?: string;
  /** Action type for UI handling */
  type: 'link' | 'retry' | 'dismiss' | 'connect-wallet';
}

/**
 * Preprod testnet faucet URL for getting tDUST
 */
export const PREPROD_FAUCET_URL = 'https://faucet.midnight.network/';

/**
 * Get user-friendly guidance for an error.
 * Use this to display helpful error messages in the UI.
 *
 * @example
 * ```typescript
 * const guidance = getErrorGuidance(error);
 * showErrorDialog({
 *   title: guidance.title,
 *   message: guidance.description,
 *   actions: guidance.actions
 * });
 * ```
 */
export function getErrorGuidance(error: unknown): ErrorGuidance {
  // Handle MidnightCloakError with specific codes
  if (isMidnightCloakError(error)) {
    switch (error.code) {
      case ErrorCodes.WALLET_NOT_CONNECTED:
        return {
          title: 'Wallet Not Connected',
          description: 'Please connect your Lace wallet to continue.',
          actions: [
            { label: 'Connect Wallet', type: 'connect-wallet' },
          ],
        };

      case ErrorCodes.VERIFICATION_DENIED:
        return {
          title: 'Verification Cancelled',
          description: 'You cancelled the verification request in your wallet.',
          actions: [
            { label: 'Try Again', type: 'retry' },
          ],
        };

      case ErrorCodes.VERIFICATION_TIMEOUT:
        return {
          title: 'Request Timed Out',
          description: 'The verification request took too long. Please try again.',
          actions: [
            { label: 'Try Again', type: 'retry' },
          ],
        };

      case ErrorCodes.PROOF_GENERATION_FAILED:
        return {
          title: 'Proof Generation Failed',
          description: 'Could not generate the zero-knowledge proof. The proof server may be unavailable.',
          actions: [
            { label: 'Try Again', type: 'retry' },
            { label: 'Check Status', type: 'link', url: 'https://status.midnight.network/' },
          ],
        };

      case ErrorCodes.NETWORK_ERROR:
        return {
          title: 'Connection Error',
          description: 'Could not connect to the Midnight network. Please check your internet connection.',
          actions: [
            { label: 'Try Again', type: 'retry' },
          ],
        };

      case ErrorCodes.CREDENTIAL_NOT_FOUND:
        return {
          title: 'Credential Not Found',
          description: 'You don\'t have the required credential in your wallet.',
          actions: [
            { label: 'Dismiss', type: 'dismiss' },
          ],
        };

      case ErrorCodes.INVALID_POLICY:
        return {
          title: 'Invalid Request',
          description: 'The verification request is invalid. Please contact the site administrator.',
          actions: [
            { label: 'Dismiss', type: 'dismiss' },
          ],
        };

      case ErrorCodes.CONTRACT_ERROR:
        return {
          title: 'Contract Error',
          description: 'An error occurred while interacting with the smart contract.',
          actions: [
            { label: 'Try Again', type: 'retry' },
          ],
        };

      case ErrorCodes.WALLET_ERROR:
        return getWalletErrorGuidance(error);

      default:
        return {
          title: 'Error',
          description: error.message || 'An unexpected error occurred.',
          actions: [
            { label: 'Try Again', type: 'retry' },
          ],
        };
    }
  }

  // Handle generic errors
  const message = error instanceof Error ? error.message : String(error);
  return {
    title: 'Error',
    description: message || 'An unexpected error occurred.',
    actions: [
      { label: 'Try Again', type: 'retry' },
    ],
  };
}

/**
 * Get specific guidance for wallet errors based on error details
 */
function getWalletErrorGuidance(error: MidnightCloakError): ErrorGuidance {
  const message = error.message.toLowerCase();

  // Detect low balance / insufficient funds
  if (message.includes('insufficient') || message.includes('balance') || message.includes('dust')) {
    return {
      title: 'Insufficient Balance',
      description: 'You need tDUST tokens to pay for transaction fees on preprod.',
      actions: [
        { label: 'Get tDUST from Faucet', type: 'link', url: PREPROD_FAUCET_URL },
        { label: 'Try Again', type: 'retry' },
      ],
    };
  }

  // Detect locked wallet
  if (message.includes('locked') || message.includes('unlock')) {
    return {
      title: 'Wallet Locked',
      description: 'Please unlock your Lace wallet and try again.',
      actions: [
        { label: 'Try Again', type: 'retry' },
      ],
    };
  }

  // Default wallet error
  return {
    title: 'Wallet Error',
    description: error.message || 'An error occurred with your wallet.',
    actions: [
      { label: 'Try Again', type: 'retry' },
    ],
  };
}
