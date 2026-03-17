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
import { assertNotProduction } from './constants';

/**
 * Network mismatch information
 */
export interface NetworkMismatchInfo {
  expected: Network;
  actual: Network;
}

/**
 * Type-safe event definitions for MidnightCloakClient.
 * Use with `client.on()` and `client.off()` for IntelliSense support.
 */
export interface ClientEvents {
  'wallet:connected': (wallet: ConnectedWallet) => void;
  'wallet:disconnected': () => void;
  'wallet:error': (error: Error) => void;
  'wallet:available': (wallet: WalletType) => void;
  'network:mismatch': (info: NetworkMismatchInfo) => void;
  'network:matched': (network: Network) => void;
  'verification:requested': (request: VerificationRequest) => void;
  'verification:approved': (result: VerificationResult) => void;
  'verification:denied': (result: VerificationResult) => void;
  'verification:error': (error: unknown, request: VerificationRequest) => void;
}

/** All valid event names for the client */
export type ClientEventName = keyof ClientEvents;

const STORAGE_KEY_LAST_WALLET = 'midnight-cloak:lastConnectedWallet';

/** Valid wallet types for type narrowing from storage */
const VALID_WALLET_TYPES: readonly WalletType[] = ['lace', 'eternl'] as const;

/**
 * Type guard for WalletType
 * Use instead of `as WalletType` casting for runtime safety
 */
function isWalletType(value: string | null): value is WalletType {
  return value !== null && VALID_WALLET_TYPES.includes(value as WalletType);
}

export class MidnightCloakClient {
  private config: Required<ClientConfig> & { autoReconnect: boolean };
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
      allowMockProofs: config.allowMockProofs ?? false,
      autoReconnect: config.autoReconnect ?? false,
    };

    // Warn if mock proofs are enabled
    if (this.config.allowMockProofs) {
      console.warn(
        '[Midnight Cloak] ⚠️ WARNING: Mock proofs enabled (allowMockProofs=true). ' +
          'This bypasses all ZK security guarantees and should NEVER be used in production. ' +
          'Real proof generation requires Lace wallet + proof server.'
      );
    }

    this.walletConnector = new WalletConnector({
      preferredWallet: this.config.preferredWallet,
      onConnect: (wallet) => this.emit('wallet:connected', wallet),
      onDisconnect: () => this.emit('wallet:disconnected'),
      onError: (error) => this.emit('wallet:error', error),
      onWalletAvailable: (wallet) => this.emit('wallet:available', wallet),
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
    const walletToConnect = wallet || this.config.preferredWallet;
    const connectedWallet = await this.walletConnector.connect(walletToConnect);

    // Store preference for auto-reconnect
    if (this.config.autoReconnect) {
      this.saveLastConnectedWallet(walletToConnect);
    }

    // Check network after connection
    await this.validateNetwork();

    return connectedWallet;
  }

  /**
   * Attempt to reconnect to the last connected wallet.
   * Only works if autoReconnect is enabled and a wallet was previously connected.
   *
   * @returns The connected wallet, or null if no previous connection or reconnect failed
   */
  async tryAutoReconnect(): Promise<ConnectedWallet | null> {
    if (!this.config.autoReconnect) {
      return null;
    }

    const lastWallet = this.getLastConnectedWallet();
    if (!lastWallet) {
      return null;
    }

    // Check if the wallet is available
    if (!this.walletConnector.isWalletAvailable(lastWallet)) {
      return null;
    }

    try {
      return await this.connectWallet(lastWallet);
    } catch {
      // Reconnect failed (wallet locked, user denied, etc.)
      // Clear the saved preference
      this.clearLastConnectedWallet();
      return null;
    }
  }

  /**
   * Get the last connected wallet from storage
   */
  getLastConnectedWallet(): WalletType | null {
    if (typeof window === 'undefined' || !window.localStorage) {
      return null;
    }
    const stored = localStorage.getItem(STORAGE_KEY_LAST_WALLET);
    if (isWalletType(stored)) {
      return stored;
    }
    return null;
  }

  /**
   * Save the last connected wallet to storage
   */
  private saveLastConnectedWallet(wallet: WalletType): void {
    if (typeof window === 'undefined' || !window.localStorage) {
      return;
    }
    localStorage.setItem(STORAGE_KEY_LAST_WALLET, wallet);
  }

  /**
   * Clear the last connected wallet from storage
   */
  clearLastConnectedWallet(): void {
    if (typeof window === 'undefined' || !window.localStorage) {
      return;
    }
    localStorage.removeItem(STORAGE_KEY_LAST_WALLET);
  }

  /**
   * Check if auto-reconnect is enabled
   */
  isAutoReconnectEnabled(): boolean {
    return this.config.autoReconnect;
  }

  /**
   * Validate that the connected wallet is on the expected network.
   * Emits 'network:mismatch' or 'network:matched' event.
   *
   * Note: Lace Midnight currently returns numeric IDs that don't reliably
   * indicate the network. When we can't determine the network, we skip
   * validation and assume it's correct.
   *
   * @returns Object with validation result and network info
   */
  async validateNetwork(): Promise<{ valid: boolean; expected: Network; actual: Network | 'unknown' }> {
    const expected = this.config.network;
    const actual = await this.walletConnector.getNetwork();

    // If we can't determine the network, skip validation
    if (actual === 'unknown') {
      this.emit('network:matched', expected);
      return { valid: true, expected, actual: 'unknown' };
    }

    if (actual !== expected) {
      this.emit('network:mismatch', { expected, actual });
      return { valid: false, expected, actual };
    }

    this.emit('network:matched', actual);
    return { valid: true, expected, actual };
  }

  /**
   * Get the currently connected wallet's network
   * Returns 'unknown' if the network cannot be reliably determined
   */
  async getConnectedNetwork(): Promise<Network | 'unknown' | null> {
    if (!this.isWalletConnected()) {
      return null;
    }
    return this.walletConnector.getNetwork();
  }

  /**
   * Get the expected network from client configuration
   */
  getExpectedNetwork(): Network {
    return this.config.network;
  }

  /**
   * Disconnect from wallet
   * @param clearPreference - If true, also clears the saved wallet preference (default: false)
   */
  disconnectWallet(clearPreference = false): void {
    this.walletConnector.disconnect();
    if (clearPreference) {
      this.clearLastConnectedWallet();
    }
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
   * Check if Eternl wallet is installed
   */
  isEternlAvailable(): boolean {
    return this.walletConnector.isEternlAvailable();
  }

  /**
   * Check if a specific wallet is available
   */
  isWalletAvailable(wallet: WalletType): boolean {
    return this.walletConnector.isWalletAvailable(wallet);
  }

  /**
   * Get the Chrome Web Store install URL for a wallet
   *
   * @example
   * ```typescript
   * const url = client.getWalletInstallUrl('lace');
   * window.open(url, '_blank');
   * ```
   */
  getWalletInstallUrl(wallet: WalletType): string {
    return this.walletConnector.getInstallUrl(wallet);
  }

  /**
   * Poll for wallet installation after user clicks install link.
   * Checks every 2 seconds for up to 60 seconds by default.
   * Emits 'wallet:available' event when wallet is detected.
   *
   * @returns Cleanup function to stop polling
   *
   * @example
   * ```typescript
   * // Start polling when user clicks install
   * const stopPolling = client.pollForWalletInstallation('lace', {
   *   onDetected: () => console.log('Lace installed!')
   * });
   *
   * // Optional: stop polling early
   * stopPolling();
   * ```
   */
  pollForWalletInstallation(
    wallet: WalletType,
    options?: { maxDuration?: number; interval?: number; onDetected?: () => void }
  ): () => void {
    return this.walletConnector.pollForWalletInstallation(wallet, options);
  }

  /**
   * Stop polling for wallet installation
   */
  stopInstallPolling(): void {
    this.walletConnector.stopInstallPolling();
  }

  /**
   * Use mock wallet for development/testing when no real wallet is available.
   * SECURITY: This method is disabled in production builds.
   *
   * @throws Error if called in production environment
   */
  useMockWallet(options?: { network?: Network; autoApprove?: boolean }): void {
    // SECURITY: Prevent mock wallet usage in production
    assertNotProduction('useMockWallet()');

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
