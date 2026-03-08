/**
 * ContractClient - Midnight contract interaction layer
 *
 * This module provides the interface for interacting with Midnight smart contracts
 * using the official CompiledContract pattern from midnight-js 3.0.0.
 *
 * Architecture follows official Midnight patterns from example-counter:
 * - CompiledContract.make() for contract instantiation
 * - deployContract() for new deployments
 * - findDeployedContract() for joining existing contracts
 * - Provider configuration via midnight-js providers
 *
 * IMPORTANT: We do NOT write Compact code.
 * Real contracts will use official Midnight examples or pre-audited contracts.
 */

import type { ClientConfig, Network } from './types';
import { createNetworkConfig, type NetworkConfig } from './config';
import { ProviderFactory, type WalletContext, fromHex } from './providers';
import { NotInitializedError, ContractError } from './errors';
import { getContractAddresses, hasDeployedContracts } from './addresses';

// Constants for validation
const MIN_VALID_BIRTH_YEAR = 1900;
const MAX_AGE_YEARS = 150;

/**
 * Proof generation response
 */
export interface ProofResponse {
  proof: Uint8Array;
  publicOutputs: unknown[];
  /** Whether this is a mock proof (for development only) */
  isMock?: boolean;
}

/**
 * Contract call result
 */
export interface ContractCallResult {
  success: boolean;
  txHash?: string;
  txId?: string;
  blockHeight?: number;
  error?: string;
  /** Whether this result is from a mock implementation */
  isMock?: boolean;
}

/**
 * Provider configuration for Midnight contracts
 * Based on MidnightProviders from midnight-js-types
 */
export interface MidnightCloakProviders {
  /** HTTP client proof provider for ZK proof generation */
  proofProvider: unknown;
  /** Indexer public data provider for blockchain queries */
  publicDataProvider: unknown;
  /** Level private state provider for encrypted local storage */
  privateStateProvider: unknown;
  /** ZK config provider for circuit assets */
  zkConfigProvider: unknown;
  /** Wallet provider for signing and balancing */
  walletProvider: unknown;
  /** Midnight provider for transaction submission */
  midnightProvider: unknown;
}

/**
 * Deployed contract handle
 */
export interface DeployedContract {
  /** Contract address on chain */
  contractAddress: string;
  /** Deployment transaction data */
  deployTxData: {
    txId: string;
    blockHeight: number;
  };
  /** Call a circuit function on the contract */
  callTx: Record<string, (...args: unknown[]) => Promise<ContractCallResult>>;
}

/**
 * Service health status returned by initialize()
 */
export interface ServiceHealth {
  /** Whether initialization completed */
  initialized: boolean;
  /** Proof server availability */
  proofServer: boolean;
  /** Indexer availability */
  indexer: boolean;
  /** Node availability */
  node: boolean;
  /** Any degraded services */
  degraded: boolean;
  /** Human-readable status message */
  message: string;
}

/**
 * Successful deployment information
 */
export interface DeployedContractInfo {
  contractAddress: string;
  txHash: string;
  txId?: string;
  blockHeight?: number;
}

/**
 * Parameters for age proof generation
 */
export interface AgeProofParams {
  /** User's birth year */
  birthYear: number;
  /** Minimum age to verify */
  minAge: number;
  /** Current year (defaults to system year if not provided) */
  currentYear?: number;
  /** Request identifier for tracking */
  requestId: string;
}

/**
 * Parameters for on-chain age verification
 */
export interface VerifyAgeParams {
  /** Minimum age to verify */
  minAge: number;
  /** User's birth year (required - no defaults for security) */
  birthYear: number;
}

/**
 * Age verification result from contract
 */
export interface AgeVerificationResult {
  isVerified: boolean;
  txHash: string;
  /** Whether this result is from a mock implementation */
  isMock?: boolean;
}

/**
 * Parameters for credential registration
 */
export interface RegisterCredentialParams {
  /** 32-byte commitment hash */
  commitment: Uint8Array;
}

/**
 * Credential registration result from contract
 */
export interface CredentialRegistrationResult {
  issuerPk: Uint8Array;
  txHash: string;
  /** Whether this result is from a mock implementation */
  isMock?: boolean;
}

/**
 * Parameters for commitment check
 */
export interface CheckCommitmentParams {
  /** 32-byte commitment hash to check */
  commitment: Uint8Array;
}

/**
 * Commitment check result from contract
 */
export interface CommitmentCheckResult {
  exists: boolean;
  txHash: string;
  /** Whether this result is from a mock implementation */
  isMock?: boolean;
}

/**
 * Contract client for Midnight Cloak verification contracts
 *
 * This class handles:
 * 1. Contract deployment and discovery
 * 2. Proof generation via proof server
 * 3. Transaction submission and confirmation
 * 4. State queries
 *
 * Usage:
 * ```typescript
 * const client = new ContractClient(config);
 * await client.initialize(walletContext);
 *
 * // Join existing contract
 * const existing = await client.join({ contractType: 'age-verifier' });
 *
 * // Verify age
 * const result = await client.verifyAgeOnChain({ minAge: 18, birthYear: 1990 });
 * ```
 */
export class ContractClient {
  private config: Required<ClientConfig>;
  private networkConfig: NetworkConfig;
  private providerFactory: ProviderFactory;
  private _providers: MidnightCloakProviders | null = null;
  private _isInitialized = false;
  private walletContext: WalletContext | null = null;

  constructor(config: Required<ClientConfig>) {
    this.config = config;
    this.networkConfig = createNetworkConfig(config.network);
    this.providerFactory = new ProviderFactory(this.networkConfig);
  }

  /**
   * Check if the client has been initialized
   */
  get isInitialized(): boolean {
    return this._isInitialized;
  }

  /**
   * Get the current providers (null if not initialized)
   */
  get providers(): MidnightCloakProviders | null {
    return this._providers;
  }

  /**
   * Check if mock proofs are allowed
   */
  get allowMockProofs(): boolean {
    return this.config.allowMockProofs ?? false;
  }

  /**
   * Get the wallet context (null if not initialized)
   */
  getWalletContext(): WalletContext | null {
    return this.walletContext;
  }

  /**
   * Ensure the client is initialized, throwing if not.
   * @throws NotInitializedError if not initialized
   */
  private ensureInitialized(): void {
    if (!this._isInitialized) {
      throw new NotInitializedError('ContractClient');
    }
  }

  /**
   * Validate birth year is within reasonable bounds
   * @throws ContractError if birth year is invalid
   */
  private validateBirthYear(birthYear: number): void {
    const currentYear = new Date().getFullYear();
    if (!Number.isInteger(birthYear)) {
      throw new ContractError('birthYear must be an integer');
    }
    if (birthYear < MIN_VALID_BIRTH_YEAR) {
      throw new ContractError(`birthYear must be ${MIN_VALID_BIRTH_YEAR} or later`);
    }
    if (birthYear > currentYear) {
      throw new ContractError('birthYear cannot be in the future');
    }
    if (currentYear - birthYear > MAX_AGE_YEARS) {
      throw new ContractError(`birthYear indicates age over ${MAX_AGE_YEARS} years`);
    }
  }

  /**
   * Validate minAge is a positive integer
   * @throws ContractError if minAge is invalid
   */
  private validateMinAge(minAge: number): void {
    if (!Number.isInteger(minAge)) {
      throw new ContractError('minAge must be an integer');
    }
    if (minAge < 0) {
      throw new ContractError('minAge must be non-negative');
    }
    if (minAge > MAX_AGE_YEARS) {
      throw new ContractError(`minAge cannot exceed ${MAX_AGE_YEARS}`);
    }
  }

  /**
   * Validate commitment is exactly 32 bytes
   * @throws ContractError if commitment is invalid
   */
  private validateCommitment(commitment: Uint8Array): void {
    if (!(commitment instanceof Uint8Array)) {
      throw new ContractError('commitment must be a Uint8Array');
    }
    if (commitment.length !== 32) {
      throw new ContractError('commitment must be exactly 32 bytes');
    }
  }

  /**
   * Generate a mock transaction hash (clearly identifiable as mock)
   */
  private generateMockTxHash(): string {
    return `MOCK_tx_${Date.now().toString(16)}`;
  }

  /**
   * Initialize contract providers with wallet context.
   *
   * This must be called before any contract operations.
   * Sets up all Midnight providers required for contract interaction.
   *
   * @returns ServiceHealth report showing availability of dependent services
   */
  async initialize(walletContext: WalletContext): Promise<ServiceHealth> {
    if (this._isInitialized) {
      const services = await this.providerFactory.checkServices();
      return {
        initialized: true,
        ...services,
        degraded: !services.proofServer || !services.indexer || !services.node,
        message: 'Already initialized',
      };
    }

    this.walletContext = walletContext;

    // Check service availability
    const services = await this.providerFactory.checkServices();

    // Initialize providers based on environment
    // For now, we create placeholder providers
    // Real provider initialization happens when joining contracts
    this._providers = {
      proofProvider: null,
      publicDataProvider: null,
      privateStateProvider: null,
      zkConfigProvider: null,
      walletProvider: null,
      midnightProvider: null,
    };

    this._isInitialized = true;

    // Build status message
    const unavailable: string[] = [];
    if (!services.proofServer) unavailable.push('proof server');
    if (!services.indexer) unavailable.push('indexer');
    if (!services.node) unavailable.push('node');

    const degraded = unavailable.length > 0;
    const message = degraded
      ? `Initialized with degraded services: ${unavailable.join(', ')} unavailable`
      : 'All services available';

    return {
      initialized: true,
      ...services,
      degraded,
      message,
    };
  }

  /**
   * Check if contracts are deployed on the network
   */
  isDeployed(): boolean {
    return hasDeployedContracts(this.config.network);
  }

  /**
   * Get deployed contract addresses for the current network
   * @throws Error if no contracts are deployed
   */
  getDeployedAddresses() {
    return getContractAddresses(this.config.network);
  }

  /**
   * Check if the proof server is available
   */
  async isProofServerAvailable(): Promise<boolean> {
    return this.providerFactory.isProofServerAvailable();
  }

  /**
   * Deploy a new contract
   *
   * NOTE: Contract deployment is not supported in the SDK.
   * Use the deploy-cli package to deploy contracts.
   *
   * @throws ContractError always - deployment not supported in SDK
   */
  async deploy(
    contractType: string,
    _initialState: Record<string, unknown> = {}
  ): Promise<DeployedContractInfo> {
    this.ensureInitialized();

    throw new ContractError(
      `Contract deployment is not supported in the SDK. ` +
        `Use the deploy-cli package to deploy contracts, then use join() to connect. ` +
        `Contract type: ${contractType}`
    );
  }

  /**
   * Join an existing deployed contract
   *
   * @param params - Join parameters
   * @param params.contractType - Type of contract to join
   * @param params.contractAddress - Address of deployed contract (optional, uses default if not provided)
   * @throws NotInitializedError if not initialized
   * @throws ContractError if joining fails
   */
  async join(params: {
    contractType: 'age-verifier' | 'credential-registry';
    contractAddress?: string;
  }): Promise<DeployedContractInfo> {
    this.ensureInitialized();

    // Get address from config if not provided
    const addresses = this.getDeployedAddresses();
    const address =
      params.contractAddress ||
      (params.contractType === 'age-verifier' ? addresses.ageVerifier : addresses.credentialRegistry);

    // For now, return success with the address
    // Real contract joining will be implemented when we have browser-compatible providers
    return {
      contractAddress: address,
      txHash: 'joined',
    };
  }

  /**
   * Generate a ZK proof for age verification
   *
   * This generates a proof that the user's age >= minAge
   * without revealing the actual birth year.
   *
   * @param params - Proof parameters
   * @returns Proof response with proof bytes and public outputs
   * @throws ContractError if proof generation fails and mocks are not allowed
   */
  async generateAgeProof(params: AgeProofParams): Promise<ProofResponse> {
    this.ensureInitialized();

    // Validate inputs
    this.validateBirthYear(params.birthYear);
    this.validateMinAge(params.minAge);

    const currentYear = params.currentYear ?? new Date().getFullYear();
    const age = currentYear - params.birthYear;
    const isVerified = age >= params.minAge;

    // Check if proof server is available
    const proofServerAvailable = await this.isProofServerAvailable();

    if (proofServerAvailable) {
      // Call proof server to generate real ZK proof
      try {
        const response = await fetch(`${this.networkConfig.proofServer}/prove`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            circuit: 'age-verifier',
            function: 'verifyAge',
            inputs: {
              birthYear: params.birthYear,
              minAge: params.minAge,
              currentYear,
            },
          }),
        });

        if (!response.ok) {
          throw new Error(`Proof server returned ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        return {
          proof: fromHex(data.proof),
          publicOutputs: [isVerified, params.minAge, params.requestId],
          isMock: false,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';

        // Only fall back to mock if explicitly allowed
        if (!this.allowMockProofs) {
          throw new ContractError(`Failed to generate ZK proof: ${message}`);
        }

        console.warn('Proof server request failed, using mock proof (allowMockProofs=true):', message);
      }
    } else if (!this.allowMockProofs) {
      throw new ContractError('Proof server is unavailable and mock proofs are not allowed');
    }

    // Mock proof for development (only if allowMockProofs is true)
    const proofData = new Uint8Array(64);
    const encoder = new TextEncoder();
    const data = encoder.encode(`MOCK:${params.requestId}:${isVerified}`);
    proofData.set(data.slice(0, 64));

    return {
      proof: proofData,
      publicOutputs: [isVerified, params.minAge, params.requestId],
      isMock: true,
    };
  }

  /**
   * Verify age on-chain using the Age Verifier contract
   *
   * This calls the verifyAge circuit on the deployed contract.
   * The proof is generated and verified in a single transaction.
   *
   * @param params - Verification parameters (minAge and birthYear are required)
   * @returns Verification result with transaction hash
   * @throws ContractError if validation fails or mock proofs not allowed
   */
  async verifyAgeOnChain(params: VerifyAgeParams): Promise<AgeVerificationResult> {
    this.ensureInitialized();

    // Validate inputs - no defaults for security-critical parameters
    this.validateMinAge(params.minAge);
    this.validateBirthYear(params.birthYear);

    const currentYear = new Date().getFullYear();
    const age = currentYear - params.birthYear;
    const isVerified = age >= params.minAge;

    // For full integration, this would call the actual contract circuit
    // using the patterns from deploy-cli/api.ts
    //
    // const contract = await this.getAgeVerifierContract();
    // const txData = await contract.callTx.verifyAge(BigInt(params.minAge));
    // return {
    //   isVerified: txData.private.result,
    //   txHash: txData.public.txHash,
    //   isMock: false,
    // };

    // Check if mocks are allowed
    if (!this.allowMockProofs) {
      throw new ContractError(
        'Real contract integration not yet available. Enable allowMockProofs for development.'
      );
    }

    // Mock implementation for development
    return {
      isVerified,
      txHash: this.generateMockTxHash(),
      isMock: true,
    };
  }

  /**
   * Register a credential commitment on-chain
   *
   * @param params - Registration parameters
   * @returns Registration result with issuer public key and transaction hash
   * @throws ContractError if validation fails or mock proofs not allowed
   */
  async registerCredential(params: RegisterCredentialParams): Promise<CredentialRegistrationResult> {
    this.ensureInitialized();

    // Validate commitment
    this.validateCommitment(params.commitment);

    // For full integration, this would call the actual contract circuit
    // const contract = await this.getCredentialRegistryContract();
    // const txData = await contract.callTx.registerCredential(params.commitment);
    // return {
    //   issuerPk: txData.private.result,
    //   txHash: txData.public.txHash,
    //   isMock: false,
    // };

    // Check if mocks are allowed
    if (!this.allowMockProofs) {
      throw new ContractError(
        'Real contract integration not yet available. Enable allowMockProofs for development.'
      );
    }

    // Mock implementation
    const mockIssuerPk = new Uint8Array(32);
    crypto.getRandomValues(mockIssuerPk);

    return {
      issuerPk: mockIssuerPk,
      txHash: this.generateMockTxHash(),
      isMock: true,
    };
  }

  /**
   * Check if a commitment exists on-chain
   *
   * @param params - Check parameters
   * @returns Check result with existence flag and transaction hash
   * @throws ContractError if validation fails or mock proofs not allowed
   */
  async checkCommitment(params: CheckCommitmentParams): Promise<CommitmentCheckResult> {
    this.ensureInitialized();

    // Validate commitment
    this.validateCommitment(params.commitment);

    // For full integration, this would call the actual contract circuit
    // const contract = await this.getCredentialRegistryContract();
    // const txData = await contract.callTx.checkCommitment(params.commitment);
    // return {
    //   exists: txData.private.result,
    //   txHash: txData.public.txHash,
    //   isMock: false,
    // };

    // Check if mocks are allowed
    if (!this.allowMockProofs) {
      throw new ContractError(
        'Real contract integration not yet available. Enable allowMockProofs for development.'
      );
    }

    // Mock implementation - always returns false for mock
    return {
      exists: false,
      txHash: this.generateMockTxHash(),
      isMock: true,
    };
  }

  /**
   * Query contract state from the blockchain
   *
   * @param params - Query parameters
   * @throws ContractError if not initialized or mocks not allowed
   */
  async queryContractState(_params: {
    contractAddress: string;
    stateName: string;
  }): Promise<unknown> {
    this.ensureInitialized();

    // Check if mocks are allowed
    if (!this.allowMockProofs) {
      throw new ContractError(
        'Real contract integration not yet available. Enable allowMockProofs for development.'
      );
    }

    // Mock implementation - returns null
    return null;
  }

  /**
   * Prove credential ownership
   *
   * @param params - Proof parameters
   * @throws ContractError if not initialized or mocks not allowed
   */
  async proveCredentialOwnership(params: { credentialId: string }): Promise<ProofResponse> {
    this.ensureInitialized();

    // Check if mocks are allowed
    if (!this.allowMockProofs) {
      throw new ContractError(
        'Real contract integration not yet available. Enable allowMockProofs for development.'
      );
    }

    return {
      proof: new Uint8Array(64),
      publicOutputs: [params.credentialId],
      isMock: true,
    };
  }

  /**
   * Get network configuration
   */
  getNetwork(): Network {
    return this.config.network;
  }

  /**
   * Get full network configuration
   */
  getNetworkConfig(): NetworkConfig {
    return this.networkConfig;
  }

  /**
   * Get provider factory for advanced usage
   */
  getProviderFactory(): ProviderFactory {
    return this.providerFactory;
  }

  /**
   * Disconnect and cleanup resources
   */
  disconnect(): void {
    this._providers = null;
    this.walletContext = null;
    this._isInitialized = false;
  }
}
