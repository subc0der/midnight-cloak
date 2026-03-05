/**
 * Verifier - Handles verification request processing
 */

import type {
  ClientConfig,
  VerificationRequest,
  VerificationResult,
  VerificationStatus,
  AgePolicy,
} from './types';
import { generateRequestId } from './utils';
import type { WalletConnector, ConnectedWallet } from './wallet-connector';
import { ContractClient } from './contract-client';
import {
  ErrorCodes,
  UnsupportedVerificationTypeError,
  ProofGenerationError,
  ContractError,
  InvalidPolicyError,
} from './errors';

export class Verifier {
  private _config: Required<ClientConfig>;
  private walletConnector: WalletConnector;
  private contractClient: ContractClient;
  private mockWallet: ConnectedWallet | null = null;
  private pendingRequests: Map<string, VerificationRequest> = new Map();

  constructor(config: Required<ClientConfig>, walletConnector: WalletConnector) {
    this._config = config;
    this.walletConnector = walletConnector;
    this.contractClient = new ContractClient(config);
  }

  get config(): Required<ClientConfig> {
    return this._config;
  }

  /**
   * Set a mock wallet for development/testing.
   * SECURITY: This method is disabled in production builds.
   */
  setMockWallet(wallet: ConnectedWallet): void {
    // SECURITY: Defense in depth - prevent mock wallet in production
    if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'production') {
      throw new Error('Mock wallets are disabled in production');
    }
    this.mockWallet = wallet;
  }

  /**
   * Get the active wallet (mock or real)
   */
  private getActiveWallet(): ConnectedWallet | null {
    return this.mockWallet || this.walletConnector.getConnection();
  }

  /**
   * Validate policy parameters at entry point.
   * SECURITY: Never trust client-constructed policies - always re-validate.
   */
  private validatePolicy(type: string, policy: unknown): void {
    if (!policy) {
      throw new InvalidPolicyError('Policy is required');
    }

    switch (type) {
      case 'AGE': {
        const agePolicy = policy as { minAge?: unknown };
        if (typeof agePolicy.minAge !== 'number') {
          throw new InvalidPolicyError('AGE policy: minAge must be a number');
        }
        if (agePolicy.minAge < 0) {
          throw new InvalidPolicyError('AGE policy: minAge cannot be negative');
        }
        if (agePolicy.minAge > 150) {
          throw new InvalidPolicyError('AGE policy: minAge exceeds reasonable maximum (150)');
        }
        if (!Number.isInteger(agePolicy.minAge)) {
          throw new InvalidPolicyError('AGE policy: minAge must be an integer');
        }
        break;
      }
      case 'TOKEN_BALANCE': {
        const tokenPolicy = policy as { token?: unknown; minBalance?: unknown };
        if (!tokenPolicy.token || typeof tokenPolicy.token !== 'string') {
          throw new InvalidPolicyError('TOKEN_BALANCE policy: token must be a non-empty string');
        }
        if (typeof tokenPolicy.minBalance !== 'number' || tokenPolicy.minBalance < 0) {
          throw new InvalidPolicyError('TOKEN_BALANCE policy: minBalance must be a non-negative number');
        }
        break;
      }
      case 'NFT_OWNERSHIP': {
        const nftPolicy = policy as { collection?: unknown; minCount?: unknown };
        if (!nftPolicy.collection || typeof nftPolicy.collection !== 'string') {
          throw new InvalidPolicyError('NFT_OWNERSHIP policy: collection must be a non-empty string');
        }
        if (nftPolicy.minCount !== undefined) {
          if (typeof nftPolicy.minCount !== 'number' || nftPolicy.minCount < 1) {
            throw new InvalidPolicyError('NFT_OWNERSHIP policy: minCount must be a positive number');
          }
        }
        break;
      }
      case 'RESIDENCY': {
        const residencyPolicy = policy as { country?: unknown };
        if (!residencyPolicy.country || typeof residencyPolicy.country !== 'string') {
          throw new InvalidPolicyError('RESIDENCY policy: country must be a non-empty string');
        }
        break;
      }
      // ACCREDITED and CREDENTIAL validation can be added when implemented
    }
  }

  async verify(request: VerificationRequest): Promise<VerificationResult> {
    const requestId = generateRequestId();
    this.pendingRequests.set(requestId, request);

    try {
      // request.type is optional in VerificationRequest, so check for undefined
      if (!request.type) {
        throw new UnsupportedVerificationTypeError('undefined');
      }

      // SECURITY: Validate policy at entry point - never trust client-constructed policies
      this.validatePolicy(request.type, request.policy);

      switch (request.type) {
        case 'AGE':
          return await this.verifyAge(requestId, request.policy as AgePolicy);
        case 'TOKEN_BALANCE':
          throw new UnsupportedVerificationTypeError('TOKEN_BALANCE');
        case 'NFT_OWNERSHIP':
          throw new UnsupportedVerificationTypeError('NFT_OWNERSHIP');
        case 'RESIDENCY':
          throw new UnsupportedVerificationTypeError('RESIDENCY');
        case 'ACCREDITED':
          throw new UnsupportedVerificationTypeError('ACCREDITED');
        case 'CREDENTIAL':
          throw new UnsupportedVerificationTypeError('CREDENTIAL');
      }
    } finally {
      this.pendingRequests.delete(requestId);
    }
  }

  private async verifyAge(requestId: string, policy: AgePolicy): Promise<VerificationResult> {
    const wallet = this.getActiveWallet();

    if (!wallet) {
      return {
        verified: false,
        requestId,
        timestamp: Date.now(),
        proof: null,
        error: { code: ErrorCodes.WALLET_NOT_CONNECTED, message: 'No wallet connected. Please connect your wallet first.' },
      };
    }

    try {
      // 1. Get wallet address and sign verification request
      const address = await wallet.getAddress();
      const payload = JSON.stringify({
        requestId,
        type: 'AGE',
        policy,
        timestamp: Date.now(),
      });

      // 2. Request signature (this prompts user approval in the wallet)
      const signature = await wallet.signData(address, payload);

      if (!signature) {
        return {
          verified: false,
          requestId,
          timestamp: Date.now(),
          proof: null,
          error: { code: ErrorCodes.VERIFICATION_DENIED, message: 'User denied verification request' },
        };
      }

      // 3. Generate ZK proof (uses proof server when available)
      let proof: { type: 'zk-snark'; data: Uint8Array; publicInputs: unknown[] };
      try {
        proof = await this.generateProofWithTimeout(requestId, 'AGE', policy);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Proof generation failed';
        return {
          verified: false,
          requestId,
          timestamp: Date.now(),
          proof: null,
          error: { code: ErrorCodes.PROOF_GENERATION_FAILED, message },
        };
      }

      // 4. Submit to contract (placeholder until Compact contracts are deployed)
      let contractResult: { verified: boolean };
      try {
        contractResult = await this.submitToContractWithTimeout(requestId, proof);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Contract execution failed';
        return {
          verified: false,
          requestId,
          timestamp: Date.now(),
          proof: null,
          error: { code: ErrorCodes.CONTRACT_ERROR, message },
        };
      }

      return {
        verified: contractResult.verified,
        requestId,
        timestamp: Date.now(),
        proof: contractResult.verified ? proof : null,
        error: contractResult.verified
          ? null
          : { code: ErrorCodes.CREDENTIAL_NOT_FOUND, message: 'Credential does not meet requirements' },
      };
    } catch (error) {
      // User rejected or wallet error
      const message = error instanceof Error ? error.message : 'Wallet operation failed';
      // Determine appropriate error code based on error type and message
      // Use specific phrase matching to avoid false positives (e.g., "denied by firewall")
      const lowerMessage = message.toLowerCase();
      const isUserRejection =
        lowerMessage.includes('user denied') ||
        lowerMessage.includes('user rejected') ||
        lowerMessage.includes('user cancelled') ||
        lowerMessage.includes('request rejected') ||
        lowerMessage.includes('transaction declined') ||
        lowerMessage === 'denied' ||
        lowerMessage === 'rejected' ||
        lowerMessage === 'cancelled';
      const errorCode = isUserRejection ? ErrorCodes.VERIFICATION_DENIED : ErrorCodes.WALLET_ERROR;
      return {
        verified: false,
        requestId,
        timestamp: Date.now(),
        proof: null,
        error: { code: errorCode, message },
      };
    }
  }

  /**
   * Generate proof with timeout protection
   * Throws ProofGenerationError on timeout or failure
   */
  private async generateProofWithTimeout(
    requestId: string,
    type: string,
    policy: AgePolicy
  ): Promise<{ type: 'zk-snark'; data: Uint8Array; publicInputs: unknown[] }> {
    const timeoutMs = this._config.timeout;

    const proofPromise = this.generateProof(requestId, type, policy);
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new ProofGenerationError(`Proof generation timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    return Promise.race([proofPromise, timeoutPromise]);
  }

  private async generateProof(
    requestId: string,
    _type: string,
    policy: AgePolicy
  ): Promise<{ type: 'zk-snark'; data: Uint8Array; publicInputs: unknown[] }> {
    // Use ContractClient for proof generation
    // In production, birthYear would come from the user's credential
    // For now, we use a mock value that will always pass (age 30)
    const currentYear = new Date().getFullYear();
    const mockBirthYear = currentYear - 30; // Mock: user is 30 years old

    const proofResponse = await this.contractClient.generateAgeProof({
      birthYear: mockBirthYear,
      minAge: policy.minAge,
      currentYear,
      requestId,
    });

    return {
      type: 'zk-snark',
      data: proofResponse.proof,
      publicInputs: proofResponse.publicOutputs,
    };
  }

  /**
   * Submit to contract with timeout protection
   * Throws ContractError on timeout or failure
   */
  private async submitToContractWithTimeout(
    requestId: string,
    proof: { type: 'zk-snark'; data: Uint8Array; publicInputs: unknown[] }
  ): Promise<{ verified: boolean }> {
    const timeoutMs = this._config.timeout;

    const submitPromise = this.submitToContract(requestId, proof);
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new ContractError(`Contract execution timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    return Promise.race([submitPromise, timeoutPromise]);
  }

  private async submitToContract(
    _requestId: string,
    proof: { type: 'zk-snark'; data: Uint8Array; publicInputs: unknown[] }
  ): Promise<{ verified: boolean }> {
    // Submit proof to contract for verification
    // Map our internal proof format to ProofResponse expected by ContractClient
    const proofResponse = {
      proof: proof.data,
      publicOutputs: proof.publicInputs,
    };
    const result = await this.contractClient.verifyAgeOnChain(proofResponse);

    return { verified: result.success };
  }

  async getStatus(requestId: string): Promise<VerificationStatus> {
    if (this.pendingRequests.has(requestId)) {
      return 'pending';
    }
    // TODO: Query contract for historical result
    return 'expired';
  }

  async cancel(requestId: string): Promise<void> {
    this.pendingRequests.delete(requestId);
  }

  disconnect(): void {
    this.pendingRequests.clear();
  }
}
