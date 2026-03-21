/**
 * Proof Generator for Midnight Cloak Extension
 *
 * Handles ZK proof generation using the official Midnight SDK pattern.
 *
 * IMPORTANT: The Midnight SDK requires DOM access (`document`), which is not
 * available in Chrome extension service workers. Therefore, actual proof
 * generation is delegated to the offscreen document, which has DOM access.
 *
 * Flow:
 * 1. Background script receives verification request
 * 2. ProofGenerator sends message to offscreen document
 * 3. Offscreen document loads SDK and generates proof
 * 4. Result is sent back to background script
 */

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
 * ProofGenerator - Generates ZK proofs via offscreen document
 *
 * Since Chrome extension service workers don't have DOM access (no `document`),
 * and the Midnight SDK requires DOM, we delegate proof generation to an
 * offscreen document that has full DOM capabilities.
 */
export class ProofGenerator {
  private serviceUris: ServiceUris | null = null;
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
   * The actual SDK initialization happens in the offscreen document.
   */
  async initialize(uris: ServiceUris): Promise<void> {
    this.serviceUris = uris;
    console.log('[ProofGenerator] Service URIs stored');
    console.log('[ProofGenerator] Prover server:', uris.proverServerUri);
    // Note: SDK initialization happens in offscreen document on first proof request
  }

  /**
   * Check if the proof generator has service URIs configured
   */
  isInitialized(): boolean {
    return this.serviceUris !== null;
  }

  /**
   * Get the prover server URI
   */
  getProverServerUri(): string | null {
    return this.serviceUris?.proverServerUri || null;
  }

  /**
   * Ensure offscreen document exists for proof generation
   */
  private async ensureOffscreenDocument(): Promise<void> {
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    });

    if (existingContexts.length > 0) {
      return; // Already exists
    }

    console.log('[ProofGenerator] Creating offscreen document for proof generation');
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: [chrome.offscreen.Reason.WORKERS],
      justification: 'Midnight SDK requires DOM access for WASM/proof generation',
    });
  }

  /**
   * Generate an age verification proof
   *
   * Delegates to offscreen document since Midnight SDK requires DOM access.
   *
   * @param input - Age proof input parameters
   * @returns Proof result with proof bytes and verification status
   */
  async generateAgeProof(input: AgeProofInput): Promise<ProofResult> {
    // Calculate age locally for UI hint (proof server result is authoritative)
    const age = input.currentYear - input.birthYear;
    const isVerified = age >= input.minAge;

    // Check if we have service URIs
    if (!this.serviceUris) {
      if (!this.config.allowMockProofs) {
        throw new Error('ZK proof generation unavailable: No service URIs. Enable allowMockProofs for development.');
      }
      console.warn('[ProofGenerator] No service URIs, using mock proof (allowMockProofs=true)');
      return this.createMockProof(isVerified, input.minAge, input.currentYear);
    }

    try {
      // Log only public inputs, never private data like birthYear
      console.log('[ProofGenerator] Generating age proof via offscreen document');
      console.log('[ProofGenerator] Public inputs:', {
        minAge: input.minAge,
        currentYear: input.currentYear,
      });

      // Ensure offscreen document exists
      await this.ensureOffscreenDocument();

      // Send proof generation request to offscreen document
      const response = await chrome.runtime.sendMessage({
        type: 'GENERATE_AGE_PROOF',
        serviceUris: this.serviceUris,
        birthYear: input.birthYear,
        minAge: input.minAge,
        currentYear: input.currentYear,
      });

      if (!response || !response.success) {
        throw new Error(response?.error || 'Proof generation failed in offscreen document');
      }

      console.log('[ProofGenerator] Proof generated successfully via offscreen');

      return {
        proof: new Uint8Array(response.proof),
        publicOutputs: [response.isVerified, input.minAge, input.currentYear],
        isVerified: response.isVerified,
        isMock: response.isMock,
      };
    } catch (error) {
      console.error('[ProofGenerator] Proof generation failed:', error);

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
    this.serviceUris = null;
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
