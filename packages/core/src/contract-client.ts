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

/**
 * Proof generation request
 */
export interface ProofRequest {
  circuit: string;
  publicInputs: unknown[];
  privateInputs: unknown[];
}

/**
 * Proof generation response
 */
export interface ProofResponse {
  proof: Uint8Array;
  publicOutputs: unknown[];
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
}

/**
 * Contract deployment result
 */
export interface DeploymentResult {
  success: boolean;
  contractAddress?: string;
  txHash?: string;
  txId?: string;
  blockHeight?: number;
  error?: string;
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
 * Contract configuration
 */
export interface ContractConfig {
  /** Name for private state storage */
  privateStateStoreName: string;
  /** Path to compiled ZK circuit assets */
  zkConfigPath: string;
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
 * Age verification result from contract
 */
export interface AgeVerificationResult {
  isVerified: boolean;
  txHash: string;
}

/**
 * Credential registration result from contract
 */
export interface CredentialRegistrationResult {
  issuerPk: Uint8Array;
  txHash: string;
}

/**
 * Commitment check result from contract
 */
export interface CommitmentCheckResult {
  exists: boolean;
  txHash: string;
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
 * // Deploy a new contract
 * const deployed = await client.deploy('age-verifier', initialState);
 *
 * // Or join existing
 * const existing = await client.join('age-verifier', contractAddress);
 *
 * // Call contract function
 * const result = await client.call(deployed, 'verify', { minAge: 18 });
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
   * In production, this will:
   * 1. Load CompiledContract for the contract type
   * 2. Create initial state
   * 3. Deploy via deployContract()
   * 4. Return contract handle with address
   *
   * @param contractType - Type of contract to deploy
   * @param initialState - Initial private state for the contract
   * @throws NotInitializedError if not initialized
   * @throws ContractError if deployment fails or not yet implemented
   */
  async deploy(
    contractType: string,
    _initialState: Record<string, unknown> = {}
  ): Promise<DeployedContractInfo> {
    this.ensureInitialized();

    // For SDK users, deployment should go through deploy-cli
    // The SDK is designed for joining existing contracts
    throw new ContractError(
      `Contract deployment is not supported in the SDK. ` +
        `Use the deploy-cli package to deploy contracts, then use join() to connect. ` +
        `Contract type: ${contractType}`
    );
  }

  /**
   * Join an existing deployed contract
   *
   * @param contractType - Type of contract to join ('age-verifier' | 'credential-registry')
   * @param contractAddress - Address of deployed contract (optional, uses default if not provided)
   * @throws NotInitializedError if not initialized
   * @throws ContractError if joining fails
   */
  async join(
    contractType: 'age-verifier' | 'credential-registry',
    contractAddress?: string
  ): Promise<DeployedContractInfo> {
    this.ensureInitialized();

    // Get address from config if not provided
    const addresses = this.getDeployedAddresses();
    const address =
      contractAddress ||
      (contractType === 'age-verifier' ? addresses.ageVerifier : addresses.credentialRegistry);

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
   */
  async generateAgeProof(params: {
    birthYear: number;
    minAge: number;
    currentYear: number;
    requestId: string;
  }): Promise<ProofResponse> {
    const age = params.currentYear - params.birthYear;
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
              currentYear: params.currentYear,
            },
          }),
        });

        if (response.ok) {
          const data = await response.json();
          return {
            proof: fromHex(data.proof),
            publicOutputs: [isVerified, params.minAge, params.requestId],
          };
        }
      } catch (error) {
        // Fall through to mock proof
        console.warn('Proof server request failed, using mock proof:', error);
      }
    }

    // Mock proof for development (64-byte placeholder)
    const proofData = new Uint8Array(64);
    const encoder = new TextEncoder();
    const data = encoder.encode(`${params.requestId}:${isVerified}`);
    proofData.set(data.slice(0, 64));

    return {
      proof: proofData,
      publicOutputs: [isVerified, params.minAge, params.requestId],
    };
  }

  /**
   * Verify age on-chain using the Age Verifier contract
   *
   * This calls the verifyAge circuit on the deployed contract.
   * The proof is generated and verified in a single transaction.
   *
   * @param minAge - Minimum age to verify
   * @param birthYear - User's birth year (will be private in ZK proof)
   * @returns Verification result with transaction hash
   */
  async verifyAgeOnChain(
    minAge: number,
    birthYear?: number
  ): Promise<AgeVerificationResult> {
    // Use provided birth year or default to 30 years old
    const currentYear = new Date().getFullYear();
    const year = birthYear ?? currentYear - 30;
    const age = currentYear - year;
    const isVerified = age >= minAge;

    // For full integration, this would call the actual contract circuit
    // using the patterns from deploy-cli/api.ts
    //
    // const contract = await this.getAgeVerifierContract();
    // const txData = await contract.callTx.verifyAge(BigInt(minAge));
    // return {
    //   isVerified: txData.private.result,
    //   txHash: txData.public.txHash,
    // };

    // Mock implementation for development
    return {
      isVerified,
      txHash: `mock_tx_${Date.now().toString(16)}`,
    };
  }

  /**
   * Verify age proof on-chain (legacy method)
   *
   * @deprecated Use verifyAgeOnChain instead
   */
  async verifyAgeOnChainLegacy(_proof: ProofResponse): Promise<ContractCallResult> {
    // Mock implementation - does not require initialization
    return {
      success: true,
      txHash: `mock_tx_${Date.now().toString(16)}`,
    };
  }

  /**
   * Register a credential commitment on-chain
   *
   * @param commitment - 32-byte commitment hash
   * @returns Registration result with issuer public key and transaction hash
   */
  async registerCredential(commitment: Uint8Array): Promise<CredentialRegistrationResult> {
    if (commitment.length !== 32) {
      throw new ContractError('Commitment must be 32 bytes');
    }

    // For full integration, this would call the actual contract circuit
    // const contract = await this.getCredentialRegistryContract();
    // const txData = await contract.callTx.registerCredential(commitment);
    // return {
    //   issuerPk: txData.private.result,
    //   txHash: txData.public.txHash,
    // };

    // Mock implementation
    const mockIssuerPk = new Uint8Array(32);
    crypto.getRandomValues(mockIssuerPk);

    return {
      issuerPk: mockIssuerPk,
      txHash: `mock_tx_${Date.now().toString(16)}`,
    };
  }

  /**
   * Check if a commitment exists on-chain
   *
   * @param commitment - 32-byte commitment hash to check
   * @returns Check result with existence flag and transaction hash
   */
  async checkCommitment(commitment: Uint8Array): Promise<CommitmentCheckResult> {
    if (commitment.length !== 32) {
      throw new ContractError('Commitment must be 32 bytes');
    }

    // For full integration, this would call the actual contract circuit
    // const contract = await this.getCredentialRegistryContract();
    // const txData = await contract.callTx.checkCommitment(commitment);
    // return {
    //   exists: txData.private.result,
    //   txHash: txData.public.txHash,
    // };

    // Mock implementation - always returns false for mock
    return {
      exists: false,
      txHash: `mock_tx_${Date.now().toString(16)}`,
    };
  }

  /**
   * Query contract state from the blockchain
   *
   * @param contractAddress - Address of the contract
   * @param stateName - Name of the state to query
   */
  async queryContractState(
    _contractAddress: string,
    _stateName: string
  ): Promise<unknown> {
    // Mock implementation - returns null
    return null;
  }

  /**
   * Issue a credential (legacy method)
   *
   * @deprecated Use registerCredential instead
   */
  async issueCredential(_params: {
    issuer: string;
    credentialId: string;
    credentialSecret: Uint8Array;
  }): Promise<ContractCallResult> {
    return {
      success: true,
      txHash: `mock_tx_${Date.now().toString(16)}`,
    };
  }

  /**
   * Prove credential ownership
   */
  async proveCredentialOwnership(credentialId: string): Promise<ProofResponse> {
    return {
      proof: new Uint8Array(64),
      publicOutputs: [credentialId],
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
