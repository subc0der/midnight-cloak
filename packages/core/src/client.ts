/**
 * MaskIDClient - Main entry point for the SDK
 */

import type {
  ClientConfig,
  Network,
  VerificationRequest,
  VerificationResult,
  VerificationStatus,
  WalletType,
} from './types';
import { Verifier } from './verifier';
import {
  WalletConnector,
  type ConnectedWallet,
  type WalletInfo,
  createMockWallet,
} from './wallet-connector';

type EventHandler = (...args: unknown[]) => void;

export class MaskIDClient {
  private config: Required<ClientConfig>;
  private verifier: Verifier;
  private walletConnector: WalletConnector;
  private eventListeners: Map<string, Set<EventHandler>> = new Map();

  constructor(config: ClientConfig) {
    this.config = {
      network: config.network,
      apiKey: config.apiKey,
      proofServerUrl: config.proofServerUrl || this.getDefaultProofServer(config.network),
      timeout: config.timeout || 30000,
      preferredWallet: config.preferredWallet || 'lace',
    };

    this.walletConnector = new WalletConnector({
      preferredWallet: this.config.preferredWallet,
      onConnect: (wallet) => this.emit('wallet:connected', wallet),
      onDisconnect: () => this.emit('wallet:disconnected'),
      onError: (error) => this.emit('wallet:error', error),
    });

    this.verifier = new Verifier(this.config, this.walletConnector);
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
   * Use mock wallet for development/testing when no real wallet is available
   */
  useMockWallet(options?: { network?: 'testnet' | 'mainnet'; autoApprove?: boolean }): void {
    const mockWallet = createMockWallet(options);
    this.verifier.setMockWallet(mockWallet);
    this.emit('wallet:connected', mockWallet);
  }
}
