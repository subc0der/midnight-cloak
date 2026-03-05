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

type EventHandler = (...args: unknown[]) => void;

export class MidnightCloakClient {
  private config: Required<ClientConfig>;
  private networkConfig: NetworkConfig;
  private verifier: Verifier;
  private walletConnector: WalletConnector;
  private eventListeners: Map<string, Set<EventHandler>> = new Map();

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
   * Get the network configuration
   */
  getNetworkConfig(): NetworkConfig {
    return this.networkConfig;
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
