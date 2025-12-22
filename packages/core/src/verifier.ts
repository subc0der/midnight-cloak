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
import { ErrorCodes, UnsupportedVerificationTypeError } from './errors';

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
   * Set a mock wallet for development/testing
   */
  setMockWallet(wallet: ConnectedWallet): void {
    this.mockWallet = wallet;
  }

  /**
   * Get the active wallet (mock or real)
   */
  private getActiveWallet(): ConnectedWallet | null {
    return this.mockWallet || this.walletConnector.getConnection();
  }

  async verify(request: VerificationRequest): Promise<VerificationResult> {
    const requestId = generateRequestId();
    this.pendingRequests.set(requestId, request);

    try {
      const verificationType = request.type;
      if (!verificationType) {
        throw new UnsupportedVerificationTypeError('undefined');
      }

      switch (verificationType) {
        case 'AGE':
          return await this.verifyAge(requestId, request.policy as AgePolicy);
        case 'TOKEN_BALANCE':
          throw new UnsupportedVerificationTypeError('TOKEN_BALANCE');
        case 'NFT_OWNERSHIP':
          throw new UnsupportedVerificationTypeError('NFT_OWNERSHIP');
        case 'RESIDENCY':
          throw new UnsupportedVerificationTypeError('RESIDENCY');
        default:
          throw new UnsupportedVerificationTypeError(verificationType);
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
      const proof = await this.generateProof(requestId, 'AGE', policy);

      // 4. Submit to contract (placeholder until Compact contracts are deployed)
      const contractResult = await this.submitToContract(requestId, proof);

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
      return {
        verified: false,
        requestId,
        timestamp: Date.now(),
        proof: null,
        error: { code: ErrorCodes.VERIFICATION_TIMEOUT, message },
      };
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

  private async submitToContract(
    _requestId: string,
    proof: { type: 'zk-snark'; data: Uint8Array; publicInputs: unknown[] }
  ): Promise<{ verified: boolean }> {
    // Submit proof to contract for verification
    const result = await this.contractClient.verifyAgeOnChain({
      proof: proof.data,
      publicOutputs: proof.publicInputs,
    });

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
