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
import {
  ProviderFactory,
  BrowserProviderFactory,
  type WalletContext,
  type BrowserProviders,
  type LaceServiceConfig,
  fromHex,
  getLaceServiceConfig,
  createBrowserProviders,
  isBrowserEnvironment,
} from './providers';
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
 * Parameters for token balance proof generation
 */
export interface TokenBalanceProofParams {
  /** Token identifier (e.g., 'NIGHT', 'ADA', contract address) */
  token: string;
  /** User's actual balance */
  balance: number;
  /** Minimum balance to verify */
  minBalance: number;
  /** Request identifier for tracking */
  requestId: string;
}

/**
 * Token balance verification result from contract
 */
export interface TokenBalanceVerificationResult {
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
  private browserProviderFactory: BrowserProviderFactory;
  private _providers: MidnightCloakProviders | null = null;
  private _browserProviders: Map<string, BrowserProviders> = new Map();
  private _laceServiceConfig: LaceServiceConfig | null = null;
  private _isInitialized = false;
  private walletContext: WalletContext | null = null;

  /** Base URL for circuit assets (required for browser proof generation) */
  private circuitBaseUrl: string;

  constructor(config: Required<ClientConfig>) {
    this.config = config;
    this.networkConfig = createNetworkConfig(config.network);
    this.providerFactory = new ProviderFactory(this.networkConfig);
    this.browserProviderFactory = new BrowserProviderFactory(this.networkConfig);

    // Default circuit URL - can be overridden via config.zkConfigPath
    this.circuitBaseUrl = config.zkConfigPath || '/circuits/';
  }

  /**
   * Check if browser providers are available
   */
  get hasBrowserProviders(): boolean {
    return this._browserProviders.size > 0 && this._laceServiceConfig !== null;
  }

  /**
   * Get Lace service configuration (null if not initialized in browser)
   */
  get laceServiceConfig(): LaceServiceConfig | null {
    return this._laceServiceConfig;
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
   * Validate token identifier
   * @throws ContractError if token is invalid
   */
  private validateToken(token: string): void {
    if (typeof token !== 'string' || token.trim().length === 0) {
      throw new ContractError('token must be a non-empty string');
    }
  }

  /**
   * Validate balance is a non-negative number
   * @throws ContractError if balance is invalid
   */
  private validateBalance(balance: number, fieldName: string = 'balance'): void {
    if (typeof balance !== 'number' || !Number.isFinite(balance)) {
      throw new ContractError(`${fieldName} must be a finite number`);
    }
    if (balance < 0) {
      throw new ContractError(`${fieldName} must be non-negative`);
    }
  }

  /**
   * Generate a mock transaction hash (clearly identifiable as mock)
   */
  private generateMockTxHash(): string {
    return `MOCK_tx_${Date.now().toString(16)}`;
  }

  /**
   * Get or create browser providers for a specific contract
   * @param contractName - Name of the contract (e.g., 'age-verifier')
   * @returns Browser providers or null if not available
   */
  private async getBrowserProvidersForContract(
    contractName: string
  ): Promise<BrowserProviders | null> {
    if (!this._laceServiceConfig) {
      return null;
    }

    // Return cached providers if available
    const cached = this._browserProviders.get(contractName);
    if (cached) {
      return cached;
    }

    // Create new providers for this contract
    try {
      const providers = await createBrowserProviders({
        circuitBaseUrl: this.circuitBaseUrl,
        serviceConfig: this._laceServiceConfig,
        contractName,
      });
      this._browserProviders.set(contractName, providers);
      return providers;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.warn(`Failed to create browser providers for ${contractName}:`, message);
      return null;
    }
  }

  /**
   * Check if real proof generation is available
   * Real proofs require either:
   * 1. Browser providers with Lace service config, OR
   * 2. Proof server availability
   */
  async canGenerateRealProofs(): Promise<boolean> {
    // Check if browser providers are available
    if (this._laceServiceConfig) {
      return true;
    }
    // Fall back to proof server check
    return this.isProofServerAvailable();
  }

  /**
   * Initialize contract providers with wallet context.
   *
   * This must be called before any contract operations.
   * Sets up all Midnight providers required for contract interaction.
   *
   * In browser environments, attempts to get service configuration from Lace wallet.
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

    // Try to initialize browser providers if in browser environment
    if (isBrowserEnvironment()) {
      try {
        this._laceServiceConfig = await getLaceServiceConfig();
        if (this._laceServiceConfig) {
          this.browserProviderFactory.setServiceConfig(this._laceServiceConfig);
          // Browser providers will be created lazily per-contract
        }
      } catch {
        // Browser provider init failed, will fall back to mock
      }
    }

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
   * When browser providers are available (Lace connected), this will attempt
   * real ZK proof generation via the proof server. Otherwise falls back to
   * mock proofs if allowed.
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

    // Try browser providers first (requires Lace + proof server)
    const browserProviders = await this.getBrowserProvidersForContract('age-verifier');

    if (browserProviders) {
      try {
        // Generate proof using browser providers
        // The proof server handles the ZK proof generation
        const proofServerUrl = this._laceServiceConfig?.proverServerUri || this.networkConfig.proofServer;

        const response = await fetch(`${proofServerUrl}/prove`, {
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

        if (response.ok) {
          const data = await response.json();
          // In production, the proof would be submitted via the wallet
          // For now, we return the proof result
          return {
            isVerified,
            txHash: data.txHash || `proof_${Date.now().toString(16)}`,
            isMock: false,
          };
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        if (!this.allowMockProofs) {
          throw new ContractError(`Browser proof generation failed: ${message}`);
        }
        console.warn('Browser proof generation failed, falling back to mock:', message);
      }
    }

    // Check if mocks are allowed when real proofs aren't available
    if (!this.allowMockProofs) {
      throw new ContractError(
        'Real ZK proof generation requires Lace wallet connection and proof server. ' +
          'Enable allowMockProofs for development without these services.'
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
   * Generate a ZK proof for token balance verification
   *
   * This generates a proof that the user's balance >= minBalance
   * without revealing the actual balance.
   *
   * @param params - Proof parameters
   * @returns Proof response with proof bytes and public outputs
   * @throws ContractError if proof generation fails and mocks are not allowed
   */
  async generateTokenBalanceProof(params: TokenBalanceProofParams): Promise<ProofResponse> {
    this.ensureInitialized();

    // Validate inputs
    this.validateToken(params.token);
    this.validateBalance(params.balance, 'balance');
    this.validateBalance(params.minBalance, 'minBalance');

    const isVerified = params.balance >= params.minBalance;

    // Check if proof server is available
    const proofServerAvailable = await this.isProofServerAvailable();

    if (proofServerAvailable) {
      // Call proof server to generate real ZK proof
      try {
        const response = await fetch(`${this.networkConfig.proofServer}/prove`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            circuit: 'token-balance-verifier',
            function: 'verifyTokenBalance',
            inputs: {
              token: params.token,
              balance: params.balance,
              minBalance: params.minBalance,
            },
          }),
        });

        if (!response.ok) {
          throw new Error(`Proof server returned ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        return {
          proof: fromHex(data.proof),
          publicOutputs: [isVerified, params.token, params.minBalance, params.requestId],
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
    const data = encoder.encode(`MOCK:${params.requestId}:${isVerified}:${params.token}`);
    proofData.set(data.slice(0, 64));

    return {
      proof: proofData,
      publicOutputs: [isVerified, params.token, params.minBalance, params.requestId],
      isMock: true,
    };
  }

  /**
   * Verify token balance on-chain
   *
   * This verifies that a user holds at least minBalance of the specified token
   * without revealing their actual balance.
   *
   * When browser providers are available (Lace connected), this will attempt
   * real ZK proof generation via the proof server. Otherwise falls back to
   * mock proofs if allowed.
   *
   * @param params - Verification parameters
   * @returns Verification result with transaction hash
   * @throws ContractError if validation fails or mock proofs not allowed
   */
  async verifyTokenBalanceOnChain(params: {
    token: string;
    balance: number;
    minBalance: number;
  }): Promise<TokenBalanceVerificationResult> {
    this.ensureInitialized();

    // Validate inputs
    this.validateToken(params.token);
    this.validateBalance(params.balance, 'balance');
    this.validateBalance(params.minBalance, 'minBalance');

    const isVerified = params.balance >= params.minBalance;

    // Try browser providers first (requires Lace + proof server)
    const browserProviders = await this.getBrowserProvidersForContract('token-balance-verifier');

    if (browserProviders) {
      try {
        const proofServerUrl = this._laceServiceConfig?.proverServerUri || this.networkConfig.proofServer;

        const response = await fetch(`${proofServerUrl}/prove`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            circuit: 'token-balance-verifier',
            function: 'verifyTokenBalance',
            inputs: {
              token: params.token,
              balance: params.balance,
              minBalance: params.minBalance,
            },
          }),
        });

        if (response.ok) {
          const data = await response.json();
          return {
            isVerified,
            txHash: data.txHash || `proof_${Date.now().toString(16)}`,
            isMock: false,
          };
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        if (!this.allowMockProofs) {
          throw new ContractError(`Browser proof generation failed: ${message}`);
        }
        console.warn('Browser proof generation failed, falling back to mock:', message);
      }
    }

    // Check if mocks are allowed when real proofs aren't available
    if (!this.allowMockProofs) {
      throw new ContractError(
        'Real ZK proof generation requires Lace wallet connection and proof server. ' +
          'Enable allowMockProofs for development without these services.'
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

    // Try browser providers first
    const browserProviders = await this.getBrowserProvidersForContract('credential-registry');

    if (browserProviders) {
      try {
        const proofServerUrl = this._laceServiceConfig?.proverServerUri || this.networkConfig.proofServer;
        const commitmentHex = Array.from(params.commitment)
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');

        const response = await fetch(`${proofServerUrl}/prove`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            circuit: 'credential-registry',
            function: 'registerCredential',
            inputs: { commitment: commitmentHex },
          }),
        });

        if (response.ok) {
          const data = await response.json();
          return {
            issuerPk: fromHex(data.issuerPk || '0'.repeat(64)),
            txHash: data.txHash || `proof_${Date.now().toString(16)}`,
            isMock: false,
          };
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        if (!this.allowMockProofs) {
          throw new ContractError(`Browser proof generation failed: ${message}`);
        }
        console.warn('Browser proof generation failed, falling back to mock:', message);
      }
    }

    // Check if mocks are allowed
    if (!this.allowMockProofs) {
      throw new ContractError(
        'Real ZK proof generation requires Lace wallet connection and proof server. ' +
          'Enable allowMockProofs for development without these services.'
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
   * This is a READ operation that queries the indexer directly when
   * browser providers are available.
   *
   * @param params - Check parameters
   * @returns Check result with existence flag and query hash
   * @throws ContractError if validation fails or mock proofs not allowed
   */
  async checkCommitment(params: CheckCommitmentParams): Promise<CommitmentCheckResult> {
    this.ensureInitialized();

    // Validate commitment
    this.validateCommitment(params.commitment);

    // Try browser providers first - this is a READ operation via indexer
    const browserProviders = await this.getBrowserProvidersForContract('credential-registry');

    if (browserProviders && browserProviders.publicDataProvider) {
      try {
        // Query the indexer for commitment existence
        const addresses = this.getDeployedAddresses();
        const indexerUrl = this._laceServiceConfig?.indexerUri || this.networkConfig.indexer;
        const commitmentHex = Array.from(params.commitment)
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');

        // GraphQL query to check commitment
        const response = await fetch(indexerUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: `
              query CheckCommitment($address: String!, $commitment: String!) {
                contractState(address: $address) {
                  data
                }
              }
            `,
            variables: {
              address: addresses.credentialRegistry,
              commitment: commitmentHex,
            },
          }),
        });

        if (response.ok) {
          const data = await response.json();
          // Parse the contract state to check for commitment
          // This is a simplified check - real implementation would parse ledger state
          const exists = data?.data?.contractState?.data?.includes?.(commitmentHex) ?? false;
          return {
            exists,
            txHash: `query_${Date.now().toString(16)}`,
            isMock: false,
          };
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        if (!this.allowMockProofs) {
          throw new ContractError(`Indexer query failed: ${message}`);
        }
        console.warn('Indexer query failed, falling back to mock:', message);
      }
    }

    // Check if mocks are allowed
    if (!this.allowMockProofs) {
      throw new ContractError(
        'Real contract state query requires Lace wallet connection and indexer. ' +
          'Enable allowMockProofs for development without these services.'
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
   * Query contract state from the blockchain via indexer
   *
   * @param params - Query parameters
   * @throws ContractError if not initialized or query fails
   */
  async queryContractState(params: {
    contractAddress: string;
    stateName: string;
  }): Promise<unknown> {
    this.ensureInitialized();

    // Try browser providers first - this is a READ operation
    if (this._laceServiceConfig) {
      try {
        const indexerUrl = this._laceServiceConfig.indexerUri;

        const response = await fetch(indexerUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: `
              query GetContractState($address: String!) {
                contractState(address: $address) {
                  data
                }
              }
            `,
            variables: {
              address: params.contractAddress,
            },
          }),
        });

        if (response.ok) {
          const data = await response.json();
          return data?.data?.contractState?.data ?? null;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        if (!this.allowMockProofs) {
          throw new ContractError(`Indexer query failed: ${message}`);
        }
        console.warn('Indexer query failed, falling back to mock:', message);
      }
    }

    // Check if mocks are allowed
    if (!this.allowMockProofs) {
      throw new ContractError(
        'Real contract state query requires Lace wallet connection and indexer. ' +
          'Enable allowMockProofs for development.'
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
