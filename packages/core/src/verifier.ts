/**
 * Verifier - Handles verification request processing
 */

import type {
  ClientConfig,
  VerificationRequest,
  VerificationResult,
  VerificationStatus,
  AgePolicy,
  SimpleVerificationRequest,
} from './types';
import { generateRequestId, withTimeout } from './utils';
import type { WalletConnector, ConnectedWallet } from './wallet-connector';
import { ContractClient } from './contract-client';
import {
  ErrorCodes,
  UnsupportedVerificationTypeError,
  ProofGenerationError,
  ContractError,
  getWalletErrorCode,
} from './errors';
import { assertValidPolicy } from './policy-validator';
import { assertNotProduction } from './constants';

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
    assertNotProduction('Mock wallets');
    this.mockWallet = wallet;
  }

  /**
   * Get the active wallet (mock or real)
   */
  private getActiveWallet(): ConnectedWallet | null {
    return this.mockWallet || this.walletConnector.getConnection();
  }

  /**
   * Type guard to check if request is a SimpleVerificationRequest
   */
  private isSimpleRequest(request: VerificationRequest): request is SimpleVerificationRequest {
    return 'type' in request && 'policy' in request;
  }

  async verify(request: VerificationRequest): Promise<VerificationResult> {
    const requestId = generateRequestId();
    this.pendingRequests.set(requestId, request);

    try {
      // Handle discriminated union: SimpleVerificationRequest vs CustomPolicyRequest
      if (!this.isSimpleRequest(request)) {
        // CustomPolicyRequest with customPolicy - not yet implemented
        throw new UnsupportedVerificationTypeError('customPolicy');
      }

      // SECURITY: Validate policy at entry point using centralized validator
      assertValidPolicy(request.type, request.policy);

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
      const payloadObj = {
        requestId,
        type: 'AGE',
        policy,
        timestamp: Date.now(),
      };
      // CIP-30 signData requires hex-encoded payload
      const payloadJson = JSON.stringify(payloadObj);
      const encoder = new TextEncoder();
      const payloadBytes = encoder.encode(payloadJson);
      const payload = Array.from(payloadBytes).map(b => b.toString(16).padStart(2, '0')).join('');

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
      const errorCode = getWalletErrorCode(message);
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
    try {
      return await withTimeout(
        this.generateProof(requestId, type, policy),
        this._config.timeout,
        `Proof generation timed out after ${this._config.timeout}ms`
      );
    } catch (error) {
      // Wrap timeout errors in ProofGenerationError for consistent error handling
      if (error instanceof Error && error.name === 'TimeoutError') {
        throw new ProofGenerationError(error.message);
      }
      throw error;
    }
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
    try {
      return await withTimeout(
        this.submitToContract(requestId, proof),
        this._config.timeout,
        `Contract execution timed out after ${this._config.timeout}ms`
      );
    } catch (error) {
      // Wrap timeout errors in ContractError for consistent error handling
      if (error instanceof Error && error.name === 'TimeoutError') {
        throw new ContractError(error.message);
      }
      throw error;
    }
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
