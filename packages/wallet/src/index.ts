/**
 * @midnight-cloak/wallet
 * Wallet utilities for Midnight Cloak credential management
 *
 * This package provides:
 * - CredentialManager: Secure storage and retrieval of user credentials
 * - ProofGenerator: ZK proof generation for verification requests
 * - RequestHandler: Handle incoming verification requests from dApps
 *
 * NOTE: For production use, consider using the wallet extension (Phase 3)
 * which provides better security through browser extension storage APIs.
 */

export { CredentialManager, CredentialManagerError } from './credential-manager';
export type { CredentialManagerConfig } from './credential-manager';

export { ProofGenerator, ProofGenerationError } from './proof-generator';
export type { ProofGeneratorConfig, ProofRequest } from './proof-generator';

export { RequestHandler, RequestHandlerError } from './request-handler';
export type { RequestHandlerConfig, VerificationResponse } from './request-handler';
