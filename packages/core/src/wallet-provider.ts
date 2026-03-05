/**
 * Midnight Wallet Provider Integration
 *
 * This module provides wallet functionality using the wallet-sdk-facade pattern.
 * It handles:
 * - HD key derivation
 * - Three sub-wallets (Shielded, Unshielded, Dust)
 * - WalletFacade orchestration
 * - Wallet/Midnight provider bridge for contract operations
 *
 * Based on official Midnight patterns from example-counter.
 */

import type { NetworkConfig } from './config';
import type { WalletContext } from './providers';
import { toHex } from './providers';

/**
 * Wallet address information
 */
export interface WalletAddresses {
  /** Shielded (ZSwap) address - mn_shield-addr_<network>1... */
  shielded: string;
  /** Unshielded address - mn_addr_<network>1... */
  unshielded: string;
  /** Dust address - mn_dust_<network>1... */
  dust: string;
}

/**
 * Wallet balance information
 */
export interface WalletBalances {
  /** Unshielded tNIGHT balance */
  night: bigint;
  /** Available DUST balance */
  dustAvailable: bigint;
  /** Pending DUST balance (locked by transactions) */
  dustPending: bigint;
}

/**
 * Wallet state information
 */
export interface WalletState {
  /** Whether the wallet is synced with the network */
  isSynced: boolean;
  /** Wallet addresses */
  addresses: WalletAddresses;
  /** Wallet balances */
  balances: WalletBalances;
  /** Number of available DUST coins */
  dustCoins: number;
  /** Number of pending DUST coins */
  pendingDustCoins: number;
  /** Number of registered NIGHT UTXOs */
  registeredNightUtxos: number;
}

/**
 * Options for building a wallet
 */
export interface BuildWalletOptions {
  /** Network configuration */
  config: NetworkConfig;
  /** Hex-encoded seed (64 characters). If not provided, generates a new one */
  seed?: string;
  /** Callback when wallet is synced */
  onSync?: () => void;
  /** Callback when funds are received */
  onFunds?: (balance: bigint) => void;
  /** Callback when DUST is available */
  onDust?: (balance: bigint) => void;
}

/**
 * Wallet builder for creating and restoring wallets
 *
 * This class provides a high-level interface for wallet operations.
 * In production, it uses the wallet-sdk-facade; currently provides mock
 * functionality until dependencies are installed.
 *
 * Usage:
 * ```typescript
 * const builder = new WalletBuilder(networkConfig);
 *
 * // Create new wallet
 * const wallet = await builder.createWallet();
 *
 * // Restore from seed
 * const restored = await builder.restoreWallet(seed);
 * ```
 */
export class WalletBuilder {
  private config: NetworkConfig;

  constructor(config: NetworkConfig) {
    this.config = config;
  }

  /**
   * Generate a new random seed using cryptographically secure RNG.
   * Throws if no secure RNG is available - NEVER falls back to insecure RNG.
   */
  generateSeed(): string {
    const bytes = new Uint8Array(32);

    // Browser environment
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(bytes);
      return toHex(bytes);
    }

    // Node.js environment
    if (typeof globalThis !== 'undefined') {
      try {
        // Dynamic import for Node.js crypto module
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const nodeCrypto = require('crypto');
        if (nodeCrypto && nodeCrypto.randomBytes) {
          const nodeBytes = nodeCrypto.randomBytes(32);
          return nodeBytes.toString('hex');
        }
      } catch {
        // Node crypto not available
      }
    }

    // SECURITY: Never fall back to Math.random() - it is NOT cryptographically secure
    throw new Error(
      'No cryptographically secure random number generator available. ' +
      'Seed generation requires crypto.getRandomValues (browser) or crypto.randomBytes (Node.js).'
    );
  }

  /**
   * Create a new wallet with a fresh seed
   */
  async createWallet(): Promise<WalletContext> {
    const seed = this.generateSeed();
    return this.buildWallet(seed);
  }

  /**
   * Restore a wallet from an existing seed
   */
  async restoreWallet(seed: string): Promise<WalletContext> {
    if (!/^[0-9a-fA-F]{64}$/.test(seed)) {
      throw new Error('Invalid seed: must be 64 hex characters');
    }
    return this.buildWallet(seed);
  }

  /**
   * Build wallet from seed
   *
   * In production, this will:
   * 1. Derive HD keys (Zswap, NightExternal, Dust)
   * 2. Create three sub-wallets
   * 3. Start WalletFacade
   * 4. Wait for sync
   */
  private async buildWallet(seed: string): Promise<WalletContext> {
    // TODO: Real implementation using wallet-sdk-facade
    // const keys = this.deriveKeysFromSeed(seed);
    // const shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(keys[Roles.Zswap]);
    // const dustSecretKey = ledger.DustSecretKey.fromSeed(keys[Roles.Dust]);
    // const unshieldedKeystore = createKeystore(keys[Roles.NightExternal], this.config.networkId);
    //
    // const shieldedWallet = ShieldedWallet(buildShieldedConfig(this.config))
    //   .startWithSecretKeys(shieldedSecretKeys);
    // const unshieldedWallet = UnshieldedWallet(buildUnshieldedConfig(this.config))
    //   .startWithPublicKey(PublicKey.fromKeyStore(unshieldedKeystore));
    // const dustWallet = DustWallet(buildDustConfig(this.config))
    //   .startWithSecretKey(dustSecretKey, ledger.LedgerParameters.initialParameters().dust);
    //
    // const wallet = new WalletFacade(shieldedWallet, unshieldedWallet, dustWallet);
    // await wallet.start(shieldedSecretKeys, dustSecretKey);

    // Mock implementation for now
    // SECURITY: Never log seeds, keys, or other sensitive data

    return {
      wallet: null,
      shieldedSecretKeys: null,
      dustSecretKey: null,
      unshieldedKeystore: null,
      seed,
    };
  }

  /**
   * Get mock wallet addresses for development
   */
  getMockAddresses(seed: string): WalletAddresses {
    const prefix = this.config.network === 'mainnet' ? '' : `_${this.config.networkId}`;
    const shortSeed = seed.slice(0, 8);

    return {
      shielded: `mn_shield-addr${prefix}1${shortSeed}...`,
      unshielded: `mn_addr${prefix}1${shortSeed}...`,
      dust: `mn_dust${prefix}1${shortSeed}...`,
    };
  }
}

/**
 * Sign transaction intents with correct proof markers
 *
 * This works around a bug in wallet-sdk-facade where signRecipe
 * uses hardcoded 'pre-proof' marker, which fails for proven transactions.
 *
 * Based on official Midnight workaround from example-counter.
 *
 * @param tx - Transaction with intents to sign
 * @param signFn - Signing function from unshielded keystore
 * @param proofMarker - 'proof' for proven tx, 'pre-proof' for unproven
 */
export function signTransactionIntents(
  tx: { intents?: Map<number, unknown> },
  _signFn: (payload: Uint8Array) => unknown,
  proofMarker: 'proof' | 'pre-proof'
): void {
  if (!tx.intents || tx.intents.size === 0) return;

  // TODO: Implement real signing when dependencies are installed
  // Placeholder - real implementation will sign without logging sensitive data
  void proofMarker; // Suppress unused variable warning

  // Real implementation:
  // for (const segment of tx.intents.keys()) {
  //   const intent = tx.intents.get(segment);
  //   if (!intent) continue;
  //
  //   const cloned = ledger.Intent.deserialize(
  //     'signature',
  //     proofMarker,
  //     'pre-binding',
  //     intent.serialize(),
  //   );
  //
  //   const sigData = cloned.signatureData(segment);
  //   const signature = signFn(sigData);
  //
  //   // Add signatures to offers...
  //   tx.intents.set(segment, cloned);
  // }
}

/**
 * Create the unified WalletProvider & MidnightProvider bridge
 *
 * This bridges the wallet-sdk-facade to the midnight-js contract API
 * by implementing balance, sign, finalize, and submit operations.
 */
export async function createWalletAndMidnightProvider(
  _ctx: WalletContext
): Promise<unknown> {
  // TODO: Real implementation
  // const state = await Rx.firstValueFrom(ctx.wallet.state().pipe(Rx.filter((s) => s.isSynced)));
  // return {
  //   getCoinPublicKey() {
  //     return state.shielded.coinPublicKey.toHexString();
  //   },
  //   getEncryptionPublicKey() {
  //     return state.shielded.encryptionPublicKey.toHexString();
  //   },
  //   async balanceTx(tx, ttl?) {
  //     const recipe = await ctx.wallet.balanceUnboundTransaction(tx, keys, { ttl });
  //     signTransactionIntents(recipe.baseTransaction, signFn, 'proof');
  //     if (recipe.balancingTransaction) {
  //       signTransactionIntents(recipe.balancingTransaction, signFn, 'pre-proof');
  //     }
  //     return ctx.wallet.finalizeRecipe(recipe);
  //   },
  //   submitTx(tx) {
  //     return ctx.wallet.submitTransaction(tx);
  //   },
  // };

  return {
    getCoinPublicKey: () => 'mock_coin_public_key',
    getEncryptionPublicKey: () => 'mock_encryption_public_key',
    balanceTx: async () => null,
    submitTx: async () => 'mock_tx_hash',
  };
}

/**
 * Wait for wallet to sync with network
 */
export async function waitForWalletSync(_wallet: unknown): Promise<void> {
  // TODO: Real implementation using RxJS
  // return Rx.firstValueFrom(
  //   wallet.state().pipe(
  //     Rx.throttleTime(5_000),
  //     Rx.filter((state) => state.isSynced),
  //   ),
  // );

  // Mock: instant resolution
  return Promise.resolve();
}

/**
 * Wait for wallet to receive funds
 */
export async function waitForFunds(_wallet: unknown): Promise<bigint> {
  // TODO: Real implementation
  // return Rx.firstValueFrom(
  //   wallet.state().pipe(
  //     Rx.throttleTime(10_000),
  //     Rx.filter((state) => state.isSynced),
  //     Rx.map((s) => s.unshielded.balances[unshieldedToken().raw] ?? 0n),
  //     Rx.filter((balance) => balance > 0n),
  //   ),
  // );

  // Mock: return fake balance
  return Promise.resolve(1_000_000_000n);
}

/**
 * Get DUST balance from wallet
 */
export async function getDustBalance(_wallet: unknown): Promise<{
  available: bigint;
  pending: bigint;
  availableCoins: number;
  pendingCoins: number;
}> {
  // TODO: Real implementation
  // const state = await Rx.firstValueFrom(wallet.state().pipe(Rx.filter((s) => s.isSynced)));
  // const available = state.dust.walletBalance(new Date());
  // const availableCoins = state.dust.availableCoins.length;
  // const pendingCoins = state.dust.pendingCoins.length;
  // const pending = state.dust.pendingCoins.reduce((sum, c) => sum + c.initialValue, 0n);
  // return { available, pending, availableCoins, pendingCoins };

  // Mock values
  return {
    available: 500_000_000_000_000n,
    pending: 0n,
    availableCoins: 1,
    pendingCoins: 0,
  };
}
