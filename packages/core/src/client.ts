/**
 * MaskIDClient - Main entry point for the SDK
 */

import type {
  ClientConfig,
  Network,
  VerificationRequest,
  VerificationResult,
  VerificationStatus,
} from './types';
import { Verifier } from './verifier';

type EventHandler = (...args: unknown[]) => void;

export class MaskIDClient {
  private config: Required<ClientConfig>;
  private verifier: Verifier;
  private eventListeners: Map<string, Set<EventHandler>> = new Map();

  constructor(config: ClientConfig) {
    this.config = {
      network: config.network,
      apiKey: config.apiKey,
      proofServerUrl: config.proofServerUrl || this.getDefaultProofServer(config.network),
      timeout: config.timeout || 30000,
    };

    this.verifier = new Verifier(this.config);
  }

  private getDefaultProofServer(network: Network): string {
    return network === 'testnet'
      ? 'http://localhost:6300'
      : 'https://proof.maskid.xyz';
  }

  async verify(request: VerificationRequest): Promise<VerificationResult> {
    this.emit('verification:requested', request);

    try {
      const result = await this.verifier.verify(request);

      if (result.verified) {
        this.emit('verification:approved', result);
      } else {
        this.emit('verification:denied', result);
      }

      return result;
    } catch (error) {
      this.emit('verification:error', error, request);
      throw error;
    }
  }

  async getVerificationStatus(requestId: string): Promise<VerificationStatus> {
    return this.verifier.getStatus(requestId);
  }

  async cancelVerification(requestId: string): Promise<void> {
    return this.verifier.cancel(requestId);
  }

  on(event: string, handler: EventHandler): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(handler);
  }

  off(event: string, handler: EventHandler): void {
    this.eventListeners.get(event)?.delete(handler);
  }

  private emit(event: string, ...args: unknown[]): void {
    this.eventListeners.get(event)?.forEach((handler) => handler(...args));
  }

  disconnect(): void {
    this.verifier.disconnect();
    this.eventListeners.clear();
  }
}
