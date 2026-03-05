/**
 * MidnightCloakClient - Main entry point for the SDK
 *
 * Built on midnight-js 3.0.0 and wallet-sdk-facade 1.0.0.
 */

import type {
  ClientConfig,
  Network,
  VerificationRequest,
  VerificationResult,
  VerificationStatus,
  WalletType,
} from './types';
import { createNetworkConfig, type NetworkConfig } from './config';
import { Verifier } from './verifier';
import {
  WalletConnector,
  type ConnectedWallet,
  type WalletInfo,
  createMockWallet,
} from './wallet-connector';

/**
 * Type-safe event definitions for MidnightCloakClient.
 * Use with `client.on()` and `client.off()` for IntelliSense support.
 */
export interface ClientEvents {
  'wallet:connected': (wallet: ConnectedWallet) => void;
  'wallet:disconnected': () => void;
  'wallet:error': (error: Error) => void;
  'verification:requested': (request: VerificationRequest) => void;
  'verification:approved': (result: VerificationResult) => void;
  'verification:denied': (result: VerificationResult) => void;
  'verification:error': (error: unknown, request: VerificationRequest) => void;
}

/** All valid event names for the client */
export type ClientEventName = keyof ClientEvents;

export class MidnightCloakClient {
  private config: Required<ClientConfig>;
  private networkConfig: NetworkConfig;
  private verifier: Verifier;
  private walletConnector: WalletConnector;
  private eventListeners: Map<ClientEventName, Set<ClientEvents[ClientEventName]>> = new Map();

  constructor(config: ClientConfig) {
    this.networkConfig = createNetworkConfig(config.network);

    this.config = {
      network: config.network,
      apiKey: config.apiKey ?? '',
      proofServerUrl: config.proofServerUrl || this.networkConfig.proofServer,
      timeout: config.timeout || 30000,
      preferredWallet: config.preferredWallet || 'lace',
      zkConfigPath: config.zkConfigPath ?? '',
    };

    this.walletConnector = new WalletConnector({
      preferredWallet: this.config.preferredWallet,
      onConnect: (wallet) => this.emit('wallet:connected', wallet),
      onDisconnect: () => this.emit('wallet:disconnected'),
      onError: (error) => this.emit('wallet:error', error),
    });

    this.verifier = new Verifier(this.config, this.walletConnector);
  }

  /**
   * Get the network configuration for the current client instance.
   *
   * @example
   * ```typescript
   * const config = client.getNetworkConfig();
   * console.log(`Connected to ${config.network} at ${config.indexer}`);
   * ```
   */
  getNetworkConfig(): NetworkConfig {
    return this.networkConfig;
  }

  /**
   * Verify a user's credential or attribute using zero-knowledge proofs.
   *
   * @param request - The verification request containing type, policy, or customPolicy
   * @returns A result object indicating success/failure with proof or error details
   *
   * @example
   * ```typescript
   * // Simple age verification
   * const result = await client.verify({
   *   type: 'AGE',
   *   policy: { kind: 'age', minAge: 18 }
   * });
   *
   * if (result.verified) {
   *   grantAccess();
   * } else {
   *   console.error(result.error?.message);
   * }
   * ```
   */
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

  /**
   * Subscribe to client events with full type safety.
   *
   * @example
   * ```typescript
   * client.on('wallet:connected', (wallet) => {
   *   console.log('Connected to wallet:', wallet);
   * });
   *
   * client.on('verification:approved', (result) => {
   *   console.log('Verified with proof:', result.proof);
   * });
   * ```
   */
  on<K extends ClientEventName>(event: K, handler: ClientEvents[K]): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    (this.eventListeners.get(event) as Set<ClientEvents[K]>).add(handler);
  }

  /**
   * Unsubscribe from client events.
   */
  off<K extends ClientEventName>(event: K, handler: ClientEvents[K]): void {
    (this.eventListeners.get(event) as Set<ClientEvents[K]> | undefined)?.delete(handler);
  }

  private emit<K extends ClientEventName>(event: K, ...args: Parameters<ClientEvents[K]>): void {
    const handlers = this.eventListeners.get(event) as Set<ClientEvents[K]> | undefined;
    handlers?.forEach((handler) => (handler as (...args: Parameters<ClientEvents[K]>) => void)(...args));
  }

  disconnect(): void {
    this.walletConnector.disconnect();
    this.verifier.disconnect();
    this.eventListeners.clear();
  }

  // Wallet connection methods
  async connectWallet(wallet?: WalletType): Promise<ConnectedWallet> {
    return this.walletConnector.connect(wallet);
  }

  disconnectWallet(): void {
    this.walletConnector.disconnect();
  }

  isWalletConnected(): boolean {
    return this.walletConnector.isConnected();
  }

  getAvailableWallets(): WalletInfo[] {
    return this.walletConnector.getAvailableWallets();
  }

  isLaceAvailable(): boolean {
    return this.walletConnector.isLaceAvailable();
  }

  /**
   * Use mock wallet for development/testing when no real wallet is available.
   * SECURITY: This method is disabled in production builds.
   *
   * @throws Error if called in production environment
   */
  useMockWallet(options?: { network?: Network; autoApprove?: boolean }): void {
    // SECURITY: Prevent mock wallet usage in production
    if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'production') {
      throw new Error(
        'useMockWallet() is disabled in production. ' +
        'Mock wallets should only be used for development and testing.'
      );
    }

    const mockWallet = createMockWallet(options);
    this.verifier.setMockWallet(mockWallet);
    this.emit('wallet:connected', mockWallet);
  }

  /**
   * Check if proof server is available
   */
  async isProofServerAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.proofServerUrl}/version`);
      return response.ok;
    } catch {
      return false;
    }
  }
}
