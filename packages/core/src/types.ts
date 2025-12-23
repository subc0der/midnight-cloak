/**
 * Core type definitions for MaskID SDK
 */

export type Network = 'testnet' | 'mainnet';

export type WalletType = 'lace' | 'nami' | 'nufi' | 'vespr';

export type VerificationType =
  | 'AGE'
  | 'TOKEN_BALANCE'
  | 'NFT_OWNERSHIP'
  | 'RESIDENCY'
  | 'ACCREDITED'
  | 'CREDENTIAL';

export interface ClientConfig {
  network: Network;
  apiKey: string;
  proofServerUrl?: string;
  timeout?: number;
  preferredWallet?: WalletType;
}

export interface AgePolicy {
  minAge: number;
}

export interface TokenBalancePolicy {
  token: string;
  minBalance: number;
}

export interface NFTOwnershipPolicy {
  collection: string;
  minCount?: number;
}

export interface ResidencyPolicy {
  country: string;
  region?: string;
}

export type PolicyConfig =
  | AgePolicy
  | TokenBalancePolicy
  | NFTOwnershipPolicy
  | ResidencyPolicy;

export interface VerificationRequest {
  type?: VerificationType;
  policy?: PolicyConfig;
  customPolicy?: Policy;
  metadata?: Record<string, string>;
  timeout?: number;
}

export interface VerificationResult {
  verified: boolean;
  requestId: string;
  timestamp: number;
  proof: Proof | null;
  error: VerificationError | null;
}

export type VerificationStatus = 'pending' | 'approved' | 'denied' | 'expired';

export interface Proof {
  type: 'zk-snark';
  data: Uint8Array;
  publicInputs: unknown[];
  verificationKey?: string;
}

export interface VerificationError {
  code: string;
  message: string;
  details?: unknown;
}

export interface Credential {
  id: string;
  type: CredentialType;
  issuer: string;
  subject: string;
  claims: Record<string, unknown>;
  issuedAt: number;
  expiresAt: number | null;
  signature: Uint8Array;
}

export type CredentialType = VerificationType;

export interface Policy {
  type: 'AND' | 'OR' | 'SINGLE';
  conditions: PolicyCondition[];
}

export interface PolicyCondition {
  type: VerificationType;
  params: PolicyConfig;
}
