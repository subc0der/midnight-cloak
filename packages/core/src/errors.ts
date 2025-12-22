/**
 * Custom error classes for MaskID SDK
 */

/**
 * Error codes used throughout the SDK
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

export class VerificationDeniedError extends MaskIDError {
  constructor(message = 'User denied verification request') {
    super(ErrorCodes.VERIFICATION_DENIED, message);
    this.name = 'VerificationDeniedError';
  }
}

export class VerificationTimeoutError extends MaskIDError {
  constructor(message = 'Verification request timed out') {
    super(ErrorCodes.VERIFICATION_TIMEOUT, message);
    this.name = 'VerificationTimeoutError';
  }
}

export class WalletNotConnectedError extends MaskIDError {
  constructor(message = 'No wallet connected') {
    super(ErrorCodes.WALLET_NOT_CONNECTED, message);
    this.name = 'WalletNotConnectedError';
  }
}

export class NetworkError extends MaskIDError {
  constructor(message = 'Network error occurred', details?: unknown) {
    super(ErrorCodes.NETWORK_ERROR, message, details);
    this.name = 'NetworkError';
  }
}

export class InvalidPolicyError extends MaskIDError {
  constructor(message = 'Invalid policy configuration', details?: unknown) {
    super(ErrorCodes.INVALID_POLICY, message, details);
    this.name = 'InvalidPolicyError';
  }
}

export class CredentialNotFoundError extends MaskIDError {
  constructor(message = 'Required credential not found') {
    super(ErrorCodes.CREDENTIAL_NOT_FOUND, message);
    this.name = 'CredentialNotFoundError';
  }
}

export class ProofGenerationError extends MaskIDError {
  constructor(message = 'Failed to generate proof', details?: unknown) {
    super(ErrorCodes.PROOF_GENERATION_FAILED, message, details);
    this.name = 'ProofGenerationError';
  }
}

export class ContractError extends MaskIDError {
  constructor(message = 'Smart contract error', details?: unknown) {
    super(ErrorCodes.CONTRACT_ERROR, message, details);
    this.name = 'ContractError';
  }
}

export class UnsupportedVerificationTypeError extends MaskIDError {
  constructor(type: string) {
    super(ErrorCodes.UNSUPPORTED_VERIFICATION_TYPE, `Verification type '${type}' is not yet implemented`);
    this.name = 'UnsupportedVerificationTypeError';
  }
}
