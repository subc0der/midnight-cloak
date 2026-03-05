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
import { ProviderFactory, type WalletContext } from './providers';

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
   * Initialize contract providers with wallet context
   *
   * This must be called before any contract operations.
   * Sets up all Midnight providers required for contract interaction.
   */
  async initialize(walletContext: WalletContext): Promise<void> {
    if (this._isInitialized) return;

    this.walletContext = walletContext;

    // Check service availability
    const services = await this.providerFactory.checkServices();
    if (!services.proofServer) {
      console.warn('Warning: Proof server not available at', this.networkConfig.proofServer);
    }
    if (!services.indexer) {
      console.warn('Warning: Indexer not available at', this.networkConfig.indexer);
    }

    // TODO: Create real providers when dependencies are installed
    // const walletAndMidnightProvider = await createWalletAndMidnightProvider(walletContext);
    // const zkConfigProvider = new NodeZkConfigProvider(this.config.zkConfigPath);
    //
    // this._providers = {
    //   privateStateProvider: levelPrivateStateProvider({
    //     privateStateStoreName: 'midnight-cloak-private-state',
    //     walletProvider: walletAndMidnightProvider,
    //   }),
    //   publicDataProvider: indexerPublicDataProvider(
    //     this.networkConfig.indexer,
    //     this.networkConfig.indexerWS
    //   ),
    //   zkConfigProvider,
    //   proofProvider: httpClientProofProvider(
    //     this.networkConfig.proofServer,
    //     zkConfigProvider
    //   ),
    //   walletProvider: walletAndMidnightProvider,
    //   midnightProvider: walletAndMidnightProvider,
    // };

    // Mock providers for now
    this._providers = {
      proofProvider: null,
      publicDataProvider: null,
      privateStateProvider: null,
      zkConfigProvider: null,
      walletProvider: null,
      midnightProvider: null,
    };

    this._isInitialized = true;
  }

  /**
   * Check if contracts are deployed on the network
   * Returns true once real contracts are deployed to Preprod
   */
  isDeployed(): boolean {
    // Will return true once contracts are deployed
    return false;
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
   */
  async deploy(
    contractType: string,
    _initialState: Record<string, unknown> = {}
  ): Promise<DeploymentResult> {
    if (!this._isInitialized) {
      return {
        success: false,
        error: 'ContractClient not initialized. Call initialize() first.',
      };
    }

    // TODO: Real deployment using CompiledContract pattern
    // const compiledContract = CompiledContract.make(contractType, Contract).pipe(
    //   CompiledContract.withVacantWitnesses,
    //   CompiledContract.withCompiledFileAssets(this.config.zkConfigPath),
    // );
    //
    // const deployed = await deployContract(this._providers, {
    //   compiledContract,
    //   privateStateId: `${contractType}PrivateState`,
    //   initialPrivateState: initialState,
    // });
    //
    // return {
    //   success: true,
    //   contractAddress: deployed.deployTxData.public.contractAddress,
    //   txId: deployed.deployTxData.public.txId,
    //   blockHeight: deployed.deployTxData.public.blockHeight,
    // };

    return {
      success: false,
      error: `Contract deployment not yet implemented for ${contractType}. Awaiting ZK contract development.`,
    };
  }

  /**
   * Join an existing deployed contract
   *
   * @param contractType - Type of contract to join
   * @param contractAddress - Address of deployed contract
   */
  async join(
    _contractType: string,
    contractAddress: string
  ): Promise<DeploymentResult> {
    if (!this._isInitialized) {
      return {
        success: false,
        error: 'ContractClient not initialized. Call initialize() first.',
      };
    }

    // TODO: Real contract joining using findDeployedContract
    // const compiledContract = CompiledContract.make(contractType, Contract).pipe(
    //   CompiledContract.withVacantWitnesses,
    //   CompiledContract.withCompiledFileAssets(this.config.zkConfigPath),
    // );
    //
    // const contract = await findDeployedContract(this._providers, {
    //   contractAddress,
    //   compiledContract,
    //   privateStateId: `${contractType}PrivateState`,
    //   initialPrivateState: {},
    // });
    //
    // return {
    //   success: true,
    //   contractAddress: contract.deployTxData.public.contractAddress,
    // };

    return {
      success: false,
      error: `Contract joining not yet implemented. Address: ${contractAddress}`,
    };
  }

  /**
   * Generate a ZK proof for age verification
   *
   * In production, this will:
   * 1. Load the age-verifier circuit
   * 2. Create proof inputs from credential
   * 3. Generate proof via proof server
   * 4. Return proof for on-chain verification
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

    if (proofServerAvailable && this._providers?.proofProvider) {
      // TODO: Real proof generation via proof server
      // const proof = await this._providers.proofProvider.prove('ageVerify', {
      //   birthYear: params.birthYear,
      //   minAge: params.minAge,
      //   currentYear: params.currentYear,
      // });
      // return { proof: proof.data, publicOutputs: proof.publicOutputs };
    }

    // Mock proof for development
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
   * Verify age proof on-chain
   */
  async verifyAgeOnChain(_proof: ProofResponse): Promise<ContractCallResult> {
    // TODO: Real on-chain verification
    // const result = await this.deployedContract.callTx.verify(proof);
    // return {
    //   success: true,
    //   txId: result.public.txId,
    //   blockHeight: result.public.blockHeight,
    // };

    return {
      success: true,
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
    // TODO: Real state query
    // const state = await this._providers.publicDataProvider
    //   .queryContractState(contractAddress);
    // return state?.data?.[stateName] ?? null;

    return null;
  }

  /**
   * Issue a credential (mock implementation)
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
   * Prove credential ownership (mock implementation)
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
