/**
 * Proof Generator for Midnight Cloak Extension
 *
 * Handles ZK proof generation using the official Midnight SDK pattern.
 * Uses FetchZkConfigProvider for circuit assets and httpClientProofProvider
 * for proof server communication.
 *
 * This follows the same pattern as the official Midnight bboard-ui example.
 *
 * NOTE: SDK imports are dynamic to avoid crashing the background script
 * if WASM fails to load in the service worker context.
 */

// SDK imports are dynamic (in initialize()) to avoid crashing background script
// if WASM modules fail to load in the service worker context.

/**
 * Service URIs from Lace wallet (matches LaceConfiguration)
 */
export interface ServiceUris {
  networkId?: string;
  proverServerUri: string;
  indexerUri: string;
  indexerWsUri: string;
  substrateNodeUri: string;
}

/**
 * Age verification proof input
 */
export interface AgeProofInput {
  birthYear: number;
  minAge: number;
  currentYear: number;
}

/**
 * Generated proof result
 */
export interface ProofResult {
  proof: Uint8Array;
  publicOutputs: unknown[];
  isVerified: boolean;
  /** True if this is a mock proof (development only) */
  isMock: boolean;
}

/**
 * Proof generator configuration
 */
export interface ProofGeneratorConfig {
  /**
   * Allow mock proofs when SDK is unavailable (default: false)
   * WARNING: Only enable for development/testing. Never use in production.
   */
  allowMockProofs?: boolean;
}

/**
 * Circuit keys type for age-verifier
 */
type AgeVerifierCircuitKeys = 'verifyAge';

/**
 * ProofGenerator - Generates ZK proofs using official Midnight SDK
 *
 * This class wraps the Midnight proof server communication using the
 * official SDK providers: FetchZkConfigProvider and httpClientProofProvider.
 */
export class ProofGenerator {
  private serviceUris: ServiceUris | null = null;
  private zkConfigProvider: unknown = null;
  private proofProvider: unknown = null;
  private sdkLoaded = false;
  private config: ProofGeneratorConfig = { allowMockProofs: false };

  /**
   * Configure the proof generator
   * @param config - Configuration options
   */
  configure(config: ProofGeneratorConfig): void {
    this.config = { ...this.config, ...config };
    if (this.config.allowMockProofs) {
      console.warn('[ProofGenerator] Mock proofs enabled - FOR DEVELOPMENT ONLY');
    }
  }

  /**
   * Initialize the proof generator with service URIs from Lace wallet
   *
   * This follows the official pattern from bboard-ui:
   * 1. Create FetchZkConfigProvider for circuit assets
   * 2. Create httpClientProofProvider with prover server URI and zkConfigProvider
   *
   * Uses dynamic imports to avoid crashing background script if WASM fails.
   */
  async initialize(uris: ServiceUris): Promise<void> {
    this.serviceUris = uris;

    try {
      // Dynamically import SDK modules to avoid crashing on startup
      const [zkConfigModule, proofProviderModule] = await Promise.all([
        import('@midnight-ntwrk/midnight-js-fetch-zk-config-provider'),
        import('@midnight-ntwrk/midnight-js-http-client-proof-provider'),
      ]);

      const { FetchZkConfigProvider } = zkConfigModule;
      const { httpClientProofProvider } = proofProviderModule;

      // Circuit assets are bundled in the extension at /circuits/age-verifier/
      const zkConfigPath = chrome.runtime.getURL('circuits/age-verifier/');

      // Create ZK config provider for loading circuit keys (browser-compatible)
      // Uses fetch bound to globalThis for service worker context
      this.zkConfigProvider = new FetchZkConfigProvider<AgeVerifierCircuitKeys>(
        zkConfigPath,
        fetch.bind(globalThis)
      );

      // Create HTTP client proof provider with the prover server URI
      this.proofProvider = httpClientProofProvider(uris.proverServerUri, this.zkConfigProvider);
      this.sdkLoaded = true;

      console.log('[ProofGenerator] Initialized with official Midnight SDK pattern');
      console.log('[ProofGenerator] Prover server:', uris.proverServerUri);
      console.log('[ProofGenerator] Circuit path:', zkConfigPath);
    } catch (error) {
      console.error('[ProofGenerator] Failed to load Midnight SDK:', error);
      this.sdkLoaded = false;
      // Note: Mock proofs will only be used if allowMockProofs is explicitly enabled
    }
  }

  /**
   * Check if the proof generator is initialized with SDK
   */
  isInitialized(): boolean {
    return this.sdkLoaded && this.proofProvider !== null && this.zkConfigProvider !== null;
  }

  /**
   * Get the prover server URI
   */
  getProverServerUri(): string | null {
    return this.serviceUris?.proverServerUri || null;
  }

  /**
   * Generate an age verification proof
   *
   * This uses the httpClientProofProvider to communicate with the
   * Midnight proof server and generate a real ZK proof.
   *
   * @param input - Age proof input parameters
   * @returns Proof result with proof bytes and verification status
   */
  async generateAgeProof(input: AgeProofInput): Promise<ProofResult> {
    // Calculate age locally for UI hint (proof server result is authoritative)
    const age = input.currentYear - input.birthYear;
    const isVerified = age >= input.minAge;

    // If SDK not loaded, check if mock proofs are allowed
    if (!this.sdkLoaded || !this.proofProvider || !this.zkConfigProvider || !this.serviceUris) {
      if (!this.config.allowMockProofs) {
        throw new Error('ZK proof generation unavailable: SDK not loaded. Enable allowMockProofs for development.');
      }
      console.warn('[ProofGenerator] SDK not available, using mock proof (allowMockProofs=true)');
      return this.createMockProof(isVerified, input.minAge, input.currentYear);
    }

    try {
      // Log only public inputs, never private data like birthYear
      console.log('[ProofGenerator] Generating age proof via Midnight SDK');
      console.log('[ProofGenerator] Public inputs:', {
        minAge: input.minAge,
        currentYear: input.currentYear,
      });

      // The proofProvider.prove() method handles the proof generation
      // It communicates with the proof server using the configured URI
      // and loads circuit assets via the zkConfigProvider
      const provider = this.proofProvider as { prove: (circuit: string, inputs: unknown) => Promise<{ proof: Uint8Array }> };
      const proofResult = await provider.prove(
        'verifyAge',
        {
          privateInput: {
            birthYear: BigInt(input.birthYear),
          },
          publicInput: {
            minAge: BigInt(input.minAge),
            currentYear: BigInt(input.currentYear),
          },
        }
      );

      console.log('[ProofGenerator] Proof generated successfully');

      return {
        proof: proofResult.proof,
        publicOutputs: [isVerified, input.minAge, input.currentYear],
        isVerified,
        isMock: false,
      };
    } catch (error) {
      console.error('[ProofGenerator] SDK proof generation failed:', error);

      // Only fall back to mock if explicitly allowed
      if (!this.config.allowMockProofs) {
        throw new Error(`ZK proof generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }

      console.warn('[ProofGenerator] Falling back to mock proof (allowMockProofs=true)');
      return this.createMockProof(isVerified, input.minAge, input.currentYear);
    }
  }

  /**
   * Create a mock proof for development/testing only
   * @private
   */
  private createMockProof(isVerified: boolean, minAge: number, currentYear: number): ProofResult {
    const mockProof = new Uint8Array(64);
    crypto.getRandomValues(mockProof);
    return {
      proof: mockProof,
      publicOutputs: [isVerified, minAge, currentYear],
      isVerified,
      isMock: true,
    };
  }

  /**
   * Clean up resources
   */
  disconnect(): void {
    this.proofProvider = null;
    this.zkConfigProvider = null;
    this.serviceUris = null;
    this.sdkLoaded = false;
  }
}

// Singleton instance for the extension
let proofGeneratorInstance: ProofGenerator | null = null;

/**
 * Get the proof generator instance
 */
export function getProofGenerator(): ProofGenerator {
  if (!proofGeneratorInstance) {
    proofGeneratorInstance = new ProofGenerator();
  }
  return proofGeneratorInstance;
}
