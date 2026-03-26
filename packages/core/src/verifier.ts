/**
 * Verifier - Handles verification request processing
 */

import type {
  ClientConfig,
  VerificationRequest,
  VerificationResult,
  VerificationStatus,
  AgePolicy,
  TokenBalancePolicy,
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
  private contractClientInitialized = false;

  constructor(config: Required<ClientConfig>, walletConnector: WalletConnector) {
    this._config = config;
    this.walletConnector = walletConnector;
    this.contractClient = new ContractClient(config);
  }

  /**
   * Ensure contract client is initialized before use
   */
  private async ensureContractClientInitialized(): Promise<void> {
    if (this.contractClientInitialized) return;

    // Initialize with minimal wallet context for SDK usage
    // Full wallet context will come from Phase 3 wallet extension
    await this.contractClient.initialize({
      wallet: null,
      shieldedSecretKeys: null,
      dustSecretKey: null,
      unshieldedKeystore: null,
      walletId: 'sdk-verifier',
    });
    this.contractClientInitialized = true;
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
          return await this.verifyTokenBalance(requestId, request.policy as TokenBalancePolicy);
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

  private async verifyTokenBalance(requestId: string, policy: TokenBalancePolicy): Promise<VerificationResult> {
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
        type: 'TOKEN_BALANCE',
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

      // 3. Generate ZK proof
      let proof: { type: 'zk-snark'; data: Uint8Array; publicInputs: unknown[] };
      try {
        proof = await this.generateTokenBalanceProofWithTimeout(requestId, policy);
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

      // 4. Submit to contract
      let contractResult: { verified: boolean };
      try {
        contractResult = await this.submitTokenBalanceToContractWithTimeout(requestId, proof, policy);
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
          : { code: ErrorCodes.CREDENTIAL_NOT_FOUND, message: 'Token balance does not meet requirements' },
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
   * Generate token balance proof with timeout protection
   */
  private async generateTokenBalanceProofWithTimeout(
    requestId: string,
    policy: TokenBalancePolicy
  ): Promise<{ type: 'zk-snark'; data: Uint8Array; publicInputs: unknown[] }> {
    try {
      return await withTimeout(
        this.generateTokenBalanceProof(requestId, policy),
        this._config.timeout,
        `Proof generation timed out after ${this._config.timeout}ms`
      );
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        throw new ProofGenerationError(error.message);
      }
      throw error;
    }
  }

  private async generateTokenBalanceProof(
    requestId: string,
    policy: TokenBalancePolicy
  ): Promise<{ type: 'zk-snark'; data: Uint8Array; publicInputs: unknown[] }> {
    await this.ensureContractClientInitialized();

    // NOTE: In production, balance would come from the user's credential in the wallet.
    // For now, we use a mock value that will always pass the verification.
    const mockBalance = policy.minBalance + 1000; // Mock: user has more than required

    const proofResponse = await this.contractClient.generateTokenBalanceProof({
      token: policy.token,
      balance: mockBalance,
      minBalance: policy.minBalance,
      requestId,
    });

    return {
      type: 'zk-snark',
      data: proofResponse.proof,
      publicInputs: proofResponse.publicOutputs,
    };
  }

  /**
   * Submit token balance proof to contract with timeout protection
   */
  private async submitTokenBalanceToContractWithTimeout(
    requestId: string,
    proof: { type: 'zk-snark'; data: Uint8Array; publicInputs: unknown[] },
    policy: TokenBalancePolicy
  ): Promise<{ verified: boolean }> {
    try {
      return await withTimeout(
        this.submitTokenBalanceToContract(requestId, proof, policy),
        this._config.timeout,
        `Contract execution timed out after ${this._config.timeout}ms`
      );
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        throw new ContractError(error.message);
      }
      throw error;
    }
  }

  private async submitTokenBalanceToContract(
    _requestId: string,
    _proof: { type: 'zk-snark'; data: Uint8Array; publicInputs: unknown[] },
    policy: TokenBalancePolicy
  ): Promise<{ verified: boolean }> {
    await this.ensureContractClientInitialized();

    // NOTE: In production, balance would come from the user's credential.
    // For now, we use a mock value that matches the proof generation.
    const mockBalance = policy.minBalance + 1000; // Must match generateTokenBalanceProof mock value

    const result = await this.contractClient.verifyTokenBalanceOnChain({
      token: policy.token,
      balance: mockBalance,
      minBalance: policy.minBalance,
    });

    return { verified: result.isVerified };
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
    // Ensure contract client is ready
    await this.ensureContractClientInitialized();

    // Use ContractClient for proof generation
    // NOTE: In Phase 3, birthYear will come from the user's credential in the wallet.
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
    // Ensure contract client is ready
    await this.ensureContractClientInitialized();

    // Extract minAge from proof public inputs
    // publicInputs = [isVerified, minAge, requestId]
    const minAge = proof.publicInputs[1] as number;

    // Call contract to verify age on-chain
    // NOTE: In Phase 3, birthYear will come from the user's credential in the wallet.
    // For now, we use a mock birthYear that matches the proof generation.
    const currentYear = new Date().getFullYear();
    const mockBirthYear = currentYear - 30; // Must match generateProof mock value

    const result = await this.contractClient.verifyAgeOnChain({
      minAge,
      birthYear: mockBirthYear,
    });

    return { verified: result.isVerified };
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
