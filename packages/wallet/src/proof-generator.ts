/**
 * ProofGenerator - Generate ZK proofs for verification requests
 *
 * NOTE: This is a placeholder implementation for MVP.
 * Production implementation will integrate with Midnight's proof server
 * running in Docker (see docs.midnight.network for setup).
 *
 * The proof server handles the actual ZK-SNARK proof generation using
 * Midnight's Compact circuits. This class prepares witness data and
 * coordinates with the proof server.
 */

import type { Credential, Proof, PolicyConfig } from '@midnight-cloak/core';
import { IS_DEVELOPMENT } from '@midnight-cloak/core';

/** Error thrown when proof generation fails */
export class ProofGenerationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'ProofGenerationError';
  }
}

export interface ProofGeneratorConfig {
  /** URL of the Midnight proof server (e.g., http://localhost:6300) */
  proofServerUrl: string;
  /** Timeout in milliseconds for proof generation (default: 60000) */
  timeout?: number;
}

export interface ProofRequest {
  /** The credential to generate a proof for */
  credential: Credential;
  /** The policy to prove against */
  policy: PolicyConfig;
  /** Unique nonce to prevent replay attacks */
  nonce: string;
}

/**
 * Validate a proof request structure.
 */
function validateProofRequest(request: ProofRequest): string[] | null {
  const errors: string[] = [];

  if (!request.credential) {
    errors.push('credential is required');
  }
  if (!request.policy) {
    errors.push('policy is required');
  }
  if (typeof request.nonce !== 'string' || request.nonce.length === 0) {
    errors.push('nonce must be a non-empty string');
  }

  // Validate policy has kind
  if (request.policy && typeof request.policy === 'object') {
    if (!('kind' in request.policy) || typeof request.policy.kind !== 'string') {
      errors.push('policy must have a kind discriminant');
    }
  }

  return errors.length > 0 ? errors : null;
}

export class ProofGenerator {
  private readonly proofServerUrl: string;

  constructor(config: ProofGeneratorConfig) {
    if (!config.proofServerUrl) {
      throw new ProofGenerationError(
        'proofServerUrl is required',
        'INVALID_CONFIG'
      );
    }
    this.proofServerUrl = config.proofServerUrl;
    // Note: config.timeout will be used in production implementation
  }

  /**
   * Generate a ZK proof for the given request.
   *
   * NOTE: This is currently a placeholder that returns a mock proof.
   * Production implementation will:
   * 1. Prepare witness data from credential claims
   * 2. Send witness + public inputs to proof server
   * 3. Return the generated ZK-SNARK proof
   *
   * @param request - The proof generation request
   * @returns The generated ZK proof
   * @throws {ProofGenerationError} If validation fails or proof generation fails
   */
  async generate(request: ProofRequest): Promise<Proof> {
    // Validate request
    const errors = validateProofRequest(request);
    if (errors) {
      throw new ProofGenerationError(
        `Invalid proof request: ${errors.join(', ')}`,
        'INVALID_REQUEST'
      );
    }

    // Check credential expiry
    if (request.credential.expiresAt !== null && Date.now() > request.credential.expiresAt) {
      throw new ProofGenerationError(
        'Cannot generate proof for expired credential',
        'CREDENTIAL_EXPIRED'
      );
    }

    // TODO: Implement actual proof server integration
    // In production, this would:
    // 1. Extract relevant claims from credential based on policy kind
    // 2. Prepare witness data (private inputs)
    // 3. Prepare public inputs (policy params, nonce)
    // 4. Send to proof server at this.proofServerUrl
    // 5. Return the generated proof

    // Log that we're using placeholder (development only)
    if (IS_DEVELOPMENT) {
      console.warn(
        '[ProofGenerator] Using placeholder implementation. ' +
        'Connect to Midnight proof server for real proofs.'
      );
    }

    // Placeholder: Return mock proof
    // The nonce is included in public inputs to bind the proof to this request
    return {
      type: 'zk-snark',
      data: this.createMockProofData(request),
      publicInputs: [
        request.nonce,
        request.policy.kind,
        // Include policy-specific public inputs
        ...this.extractPublicInputs(request.policy),
      ],
    };
  }

  /**
   * Verify a ZK proof.
   *
   * NOTE: This is currently a placeholder.
   * Production implementation will verify the proof against the verification key.
   *
   * @param proof - The proof to verify
   * @returns True if valid, false otherwise
   */
  async verify(proof: Proof): Promise<boolean> {
    // Basic sanity checks
    if (!proof || proof.type !== 'zk-snark') {
      return false;
    }

    if (!(proof.data instanceof Uint8Array) || proof.data.length === 0) {
      return false;
    }

    if (!Array.isArray(proof.publicInputs) || proof.publicInputs.length === 0) {
      return false;
    }

    // TODO: Implement actual proof verification
    // In production, this would verify against the verification key

    return true;
  }

  /**
   * Check if the proof server is available.
   */
  async isServerAvailable(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${this.proofServerUrl}/health`, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Create mock proof data for development.
   * In production, this comes from the proof server.
   */
  private createMockProofData(request: ProofRequest): Uint8Array {
    // Create deterministic mock data based on request
    // This allows tests to verify the proof was generated for the right request
    const encoder = new TextEncoder();
    const requestHash = encoder.encode(
      `${request.credential.id}:${request.policy.kind}:${request.nonce}`
    );

    // Pad or truncate to 256 bytes (typical ZK proof size)
    const proofData = new Uint8Array(256);
    proofData.set(requestHash.slice(0, 256));

    return proofData;
  }

  /**
   * Extract policy-specific public inputs.
   */
  private extractPublicInputs(policy: PolicyConfig): unknown[] {
    switch (policy.kind) {
      case 'age':
        return [policy.minAge];
      case 'token_balance':
        return [policy.token, policy.minBalance];
      case 'nft_ownership':
        return [policy.collection, policy.minCount ?? 1];
      case 'residency':
        return [policy.country, policy.region ?? ''];
      default:
        return [];
    }
  }
}
