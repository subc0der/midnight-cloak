/**
 * Custom error classes for MaskID SDK
 */

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
    super('E002', message);
    this.name = 'VerificationDeniedError';
  }
}

export class VerificationTimeoutError extends MaskIDError {
  constructor(message = 'Verification request timed out') {
    super('E003', message);
    this.name = 'VerificationTimeoutError';
  }
}

export class WalletNotConnectedError extends MaskIDError {
  constructor(message = 'No wallet connected') {
    super('E001', message);
    this.name = 'WalletNotConnectedError';
  }
}

export class NetworkError extends MaskIDError {
  constructor(message = 'Network error occurred', details?: unknown) {
    super('E007', message, details);
    this.name = 'NetworkError';
  }
}

export class InvalidPolicyError extends MaskIDError {
  constructor(message = 'Invalid policy configuration', details?: unknown) {
    super('E004', message, details);
    this.name = 'InvalidPolicyError';
  }
}

export class CredentialNotFoundError extends MaskIDError {
  constructor(message = 'Required credential not found') {
    super('E005', message);
    this.name = 'CredentialNotFoundError';
  }
}

export class ProofGenerationError extends MaskIDError {
  constructor(message = 'Failed to generate proof', details?: unknown) {
    super('E006', message, details);
    this.name = 'ProofGenerationError';
  }
}

export class ContractError extends MaskIDError {
  constructor(message = 'Smart contract error', details?: unknown) {
    super('E008', message, details);
    this.name = 'ContractError';
  }
}
