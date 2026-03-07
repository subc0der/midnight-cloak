// Core deployment API for Midnight Cloak
// Based on example-counter patterns from Midnight Network

import { type ContractAddress } from '@midnight-ntwrk/compact-runtime';
import * as ledger from '@midnight-ntwrk/ledger-v7';
import { unshieldedToken } from '@midnight-ntwrk/ledger-v7';
import { deployContract, findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { type MidnightProvider, type WalletProvider } from '@midnight-ntwrk/midnight-js-types';
import { assertIsContractAddress, toHex } from '@midnight-ntwrk/midnight-js-utils';
import { getNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { CompiledContract } from '@midnight-ntwrk/compact-js';
import { WalletFacade } from '@midnight-ntwrk/wallet-sdk-facade';
import { DustWallet } from '@midnight-ntwrk/wallet-sdk-dust-wallet';
import { HDWallet, Roles, generateRandomSeed } from '@midnight-ntwrk/wallet-sdk-hd';
import { ShieldedWallet } from '@midnight-ntwrk/wallet-sdk-shielded';
import {
  createKeystore,
  InMemoryTransactionHistoryStorage,
  PublicKey,
  UnshieldedWallet,
  type UnshieldedKeystore,
} from '@midnight-ntwrk/wallet-sdk-unshielded-wallet';
import {
  MidnightBech32m,
  ShieldedAddress,
  ShieldedCoinPublicKey,
  ShieldedEncryptionPublicKey,
} from '@midnight-ntwrk/wallet-sdk-address-format';
import * as Rx from 'rxjs';
import { WebSocket } from 'ws';
import { Buffer } from 'buffer';
import { type Logger } from 'pino';

import { type Config, contractConfig } from './config.js';
// Import contract modules as namespaces (like example-counter pattern)
import * as AgeVerifier from '../../contracts/src/managed/age-verifier/contract/index.js';
import * as CredentialRegistry from '../../contracts/src/managed/credential-registry/contract/index.js';
// Import witnesses
import { ageVerifierWitnesses } from '../../contracts/src/age-verifier-witnesses.js';
import { credentialRegistryWitnesses } from '../../contracts/src/credential-registry-witnesses.js';

// Private state types
export interface AgeVerifierPrivateState {
  birthYear: number;
  currentYear: number;
}

export interface CredentialRegistryPrivateState {
  secretKey: Uint8Array;
}

// Type aliases for providers and contracts
export type AgeVerifierProviders = any;
export type CredentialRegistryProviders = any;
export type DeployedAgeVerifierContract = any;
export type DeployedCredentialRegistryContract = any;

const AgeVerifierPrivateStateId = 'ageVerifierPrivateState';
const CredentialRegistryPrivateStateId = 'credentialRegistryPrivateState';

let logger: Logger;

// Required for GraphQL subscriptions (wallet sync) to work in Node.js
// @ts-expect-error: Needed for apollo WebSocket usage
globalThis.WebSocket = WebSocket;

// ─── Compiled Contracts ─────────────────────────────────────────────────────

// Pre-compile contracts with ZK circuit assets and witnesses
const ageVerifierCompiledContract = CompiledContract.make('age-verifier', AgeVerifier.Contract).pipe(
  CompiledContract.withWitnesses(ageVerifierWitnesses),
  CompiledContract.withCompiledFileAssets(contractConfig.ageVerifierZkPath),
);

const credentialRegistryCompiledContract = CompiledContract.make('credential-registry', CredentialRegistry.Contract).pipe(
  CompiledContract.withWitnesses(credentialRegistryWitnesses),
  CompiledContract.withCompiledFileAssets(contractConfig.credentialRegistryZkPath),
);

// ─── Wallet Context ─────────────────────────────────────────────────────────

export interface WalletContext {
  wallet: WalletFacade;
  shieldedSecretKeys: ledger.ZswapSecretKeys;
  dustSecretKey: ledger.DustSecretKey;
  unshieldedKeystore: UnshieldedKeystore;
}

// ─── Utility Functions ──────────────────────────────────────────────────────

const formatBalance = (balance: bigint): string => balance.toLocaleString();

export const withStatus = async <T>(message: string, fn: () => Promise<T>): Promise<T> => {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let i = 0;
  const interval = setInterval(() => {
    process.stdout.write(`\r  ${frames[i++ % frames.length]} ${message}`);
  }, 80);
  try {
    const result = await fn();
    clearInterval(interval);
    process.stdout.write(`\r  ✓ ${message}\n`);
    return result;
  } catch (e) {
    clearInterval(interval);
    process.stdout.write(`\r  ✗ ${message}\n`);
    throw e;
  }
};

// ─── Sign Transaction Workaround ────────────────────────────────────────────

/**
 * Sign all unshielded offers in a transaction's intents, using the correct
 * proof marker for Intent.deserialize. This works around a bug in the wallet
 * SDK where signRecipe hardcodes 'pre-proof', which fails for proven
 * (UnboundTransaction) intents that contain 'proof' data.
 */
const signTransactionIntents = (
  tx: { intents?: Map<number, any> },
  signFn: (payload: Uint8Array) => ledger.Signature,
  proofMarker: 'proof' | 'pre-proof',
): void => {
  if (!tx.intents || tx.intents.size === 0) return;

  for (const segment of tx.intents.keys()) {
    const intent = tx.intents.get(segment);
    if (!intent) continue;

    const cloned = ledger.Intent.deserialize<ledger.SignatureEnabled, ledger.Proofish, ledger.PreBinding>(
      'signature',
      proofMarker,
      'pre-binding',
      intent.serialize(),
    );

    const sigData = cloned.signatureData(segment);
    const signature = signFn(sigData);

    if (cloned.fallibleUnshieldedOffer) {
      const sigs = cloned.fallibleUnshieldedOffer.inputs.map(
        (_: ledger.UtxoSpend, i: number) => cloned.fallibleUnshieldedOffer!.signatures.at(i) ?? signature,
      );
      cloned.fallibleUnshieldedOffer = cloned.fallibleUnshieldedOffer.addSignatures(sigs);
    }

    if (cloned.guaranteedUnshieldedOffer) {
      const sigs = cloned.guaranteedUnshieldedOffer.inputs.map(
        (_: ledger.UtxoSpend, i: number) => cloned.guaranteedUnshieldedOffer!.signatures.at(i) ?? signature,
      );
      cloned.guaranteedUnshieldedOffer = cloned.guaranteedUnshieldedOffer.addSignatures(sigs);
    }

    tx.intents.set(segment, cloned);
  }
};

// ─── Wallet Provider Bridge ─────────────────────────────────────────────────

export const createWalletAndMidnightProvider = async (
  ctx: WalletContext,
): Promise<WalletProvider & MidnightProvider> => {
  const state = await Rx.firstValueFrom(ctx.wallet.state().pipe(Rx.filter((s) => s.isSynced)));
  return {
    getCoinPublicKey() {
      return state.shielded.coinPublicKey.toHexString();
    },
    getEncryptionPublicKey() {
      return state.shielded.encryptionPublicKey.toHexString();
    },
    async balanceTx(tx, ttl?) {
      const recipe = await ctx.wallet.balanceUnboundTransaction(
        tx,
        { shieldedSecretKeys: ctx.shieldedSecretKeys, dustSecretKey: ctx.dustSecretKey },
        { ttl: ttl ?? new Date(Date.now() + 30 * 60 * 1000) },
      );

      // Workaround: sign manually with correct proof markers
      const signFn = (payload: Uint8Array) => ctx.unshieldedKeystore.signData(payload);
      signTransactionIntents(recipe.baseTransaction, signFn, 'proof');
      if (recipe.balancingTransaction) {
        signTransactionIntents(recipe.balancingTransaction, signFn, 'pre-proof');
      }

      return ctx.wallet.finalizeRecipe(recipe);
    },
    submitTx(tx) {
      return ctx.wallet.submitTransaction(tx) as any;
    },
  };
};

// ─── Wallet Helpers ─────────────────────────────────────────────────────────

export const waitForSync = (wallet: WalletFacade) =>
  Rx.firstValueFrom(
    wallet.state().pipe(
      Rx.throttleTime(5_000),
      Rx.filter((state) => state.isSynced),
    ),
  );

export const waitForFunds = (wallet: WalletFacade): Promise<bigint> =>
  Rx.firstValueFrom(
    wallet.state().pipe(
      Rx.throttleTime(10_000),
      Rx.filter((state) => state.isSynced),
      Rx.map((s) => s.unshielded.balances[unshieldedToken().raw] ?? 0n),
      Rx.filter((balance) => balance > 0n),
    ),
  );

const deriveKeysFromSeed = (seed: string) => {
  const hdWallet = HDWallet.fromSeed(Buffer.from(seed, 'hex'));
  if (hdWallet.type !== 'seedOk') {
    throw new Error('Failed to initialize HDWallet from seed');
  }

  const derivationResult = hdWallet.hdWallet
    .selectAccount(0)
    .selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust])
    .deriveKeysAt(0);

  if (derivationResult.type !== 'keysDerived') {
    throw new Error('Failed to derive keys');
  }

  hdWallet.hdWallet.clear();
  return derivationResult.keys;
};

// ─── Wallet Config Builders ─────────────────────────────────────────────────

const buildShieldedConfig = ({ indexer, indexerWS, node, proofServer }: Config) => ({
  networkId: getNetworkId(),
  indexerClientConnection: {
    indexerHttpUrl: indexer,
    indexerWsUrl: indexerWS,
  },
  provingServerUrl: new URL(proofServer),
  relayURL: new URL(node.replace(/^http/, 'ws')),
});

const buildUnshieldedConfig = ({ indexer, indexerWS }: Config) => ({
  networkId: getNetworkId(),
  indexerClientConnection: {
    indexerHttpUrl: indexer,
    indexerWsUrl: indexerWS,
  },
  txHistoryStorage: new InMemoryTransactionHistoryStorage(),
});

const buildDustConfig = ({ indexer, indexerWS, node, proofServer }: Config) => ({
  networkId: getNetworkId(),
  costParameters: {
    additionalFeeOverhead: 300_000_000_000_000n,
    feeBlocksMargin: 5,
  },
  indexerClientConnection: {
    indexerHttpUrl: indexer,
    indexerWsUrl: indexerWS,
  },
  provingServerUrl: new URL(proofServer),
  relayURL: new URL(node.replace(/^http/, 'ws')),
});

// ─── DUST Registration ──────────────────────────────────────────────────────

const registerForDustGeneration = async (
  wallet: WalletFacade,
  unshieldedKeystore: UnshieldedKeystore,
): Promise<void> => {
  const state = await Rx.firstValueFrom(wallet.state().pipe(Rx.filter((s) => s.isSynced)));

  if (state.dust.availableCoins.length > 0) {
    const dustBal = state.dust.walletBalance(new Date());
    console.log(`  ✓ Dust tokens already available (${formatBalance(dustBal)} DUST)`);
    return;
  }

  const nightUtxos = state.unshielded.availableCoins.filter(
    (coin: any) => coin.meta?.registeredForDustGeneration !== true,
  );

  if (nightUtxos.length === 0) {
    await withStatus('Waiting for dust tokens to generate', () =>
      Rx.firstValueFrom(
        wallet.state().pipe(
          Rx.throttleTime(5_000),
          Rx.filter((s) => s.isSynced),
          Rx.filter((s) => s.dust.walletBalance(new Date()) > 0n),
        ),
      ),
    );
    return;
  }

  await withStatus(`Registering ${nightUtxos.length} NIGHT UTXO(s) for dust generation`, async () => {
    const recipe = await wallet.registerNightUtxosForDustGeneration(
      nightUtxos,
      unshieldedKeystore.getPublicKey(),
      (payload) => unshieldedKeystore.signData(payload),
    );
    const finalized = await wallet.finalizeRecipe(recipe);
    await wallet.submitTransaction(finalized);
  });

  await withStatus('Waiting for dust tokens to generate', () =>
    Rx.firstValueFrom(
      wallet.state().pipe(
        Rx.throttleTime(5_000),
        Rx.filter((s) => s.isSynced),
        Rx.filter((s) => s.dust.walletBalance(new Date()) > 0n),
      ),
    ),
  );
};

// ─── Wallet Summary ─────────────────────────────────────────────────────────

const printWalletSummary = (seed: string, state: any, unshieldedKeystore: UnshieldedKeystore) => {
  const networkId = getNetworkId();
  const unshieldedBalance = state.unshielded.balances[unshieldedToken().raw] ?? 0n;

  const coinPubKey = ShieldedCoinPublicKey.fromHexString(state.shielded.coinPublicKey.toHexString());
  const encPubKey = ShieldedEncryptionPublicKey.fromHexString(state.shielded.encryptionPublicKey.toHexString());
  const shieldedAddress = MidnightBech32m.encode(networkId, new ShieldedAddress(coinPubKey, encPubKey)).toString();

  const DIV = '──────────────────────────────────────────────────────────────';

  console.log(`
${DIV}
  Wallet Overview                            Network: ${networkId}
${DIV}
  Seed: ${seed}
${DIV}

  Shielded (ZSwap)
  └─ Address: ${shieldedAddress}

  Unshielded
  ├─ Address: ${unshieldedKeystore.getBech32Address()}
  └─ Balance: ${formatBalance(unshieldedBalance)} tNight

  Dust
  └─ Address: ${state.dust.dustAddress}

${DIV}`);
};

// ─── Build Wallet ───────────────────────────────────────────────────────────

export const buildWalletAndWaitForFunds = async (config: Config, seed: string): Promise<WalletContext> => {
  console.log('');

  const { wallet, shieldedSecretKeys, dustSecretKey, unshieldedKeystore } = await withStatus(
    'Building wallet',
    async () => {
      const keys = deriveKeysFromSeed(seed);
      const shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(keys[Roles.Zswap]);
      const dustSecretKey = ledger.DustSecretKey.fromSeed(keys[Roles.Dust]);
      const unshieldedKeystore = createKeystore(keys[Roles.NightExternal], getNetworkId());

      const shieldedWallet = ShieldedWallet(buildShieldedConfig(config)).startWithSecretKeys(shieldedSecretKeys);
      const unshieldedWallet = UnshieldedWallet(buildUnshieldedConfig(config)).startWithPublicKey(
        PublicKey.fromKeyStore(unshieldedKeystore),
      );
      const dustWallet = DustWallet(buildDustConfig(config)).startWithSecretKey(
        dustSecretKey,
        ledger.LedgerParameters.initialParameters().dust,
      );

      const wallet = new WalletFacade(shieldedWallet, unshieldedWallet, dustWallet);
      await wallet.start(shieldedSecretKeys, dustSecretKey);

      return { wallet, shieldedSecretKeys, dustSecretKey, unshieldedKeystore };
    },
  );

  const networkId = getNetworkId();
  const DIV = '──────────────────────────────────────────────────────────────';
  console.log(`
${DIV}
  Wallet Overview                            Network: ${networkId}
${DIV}
  Seed: ${seed}

  Unshielded Address (send tNight here):
  ${unshieldedKeystore.getBech32Address()}

  Fund your wallet with tNight from the Preprod faucet:
  https://faucet.preprod.midnight.network/
${DIV}
`);

  const syncedState = await withStatus('Syncing with network', () => waitForSync(wallet));
  printWalletSummary(seed, syncedState, unshieldedKeystore);

  const balance = syncedState.unshielded.balances[unshieldedToken().raw] ?? 0n;
  if (balance === 0n) {
    const fundedBalance = await withStatus('Waiting for incoming tokens', () => waitForFunds(wallet));
    console.log(`    Balance: ${formatBalance(fundedBalance)} tNight\n`);
  }

  await registerForDustGeneration(wallet, unshieldedKeystore);

  return { wallet, shieldedSecretKeys, dustSecretKey, unshieldedKeystore };
};

export const buildFreshWallet = async (config: Config): Promise<WalletContext> =>
  await buildWalletAndWaitForFunds(config, toHex(Buffer.from(generateRandomSeed())));

// ─── Provider Configuration ─────────────────────────────────────────────────

export const configureAgeVerifierProviders = async (ctx: WalletContext, config: Config): Promise<AgeVerifierProviders> => {
  const walletAndMidnightProvider = await createWalletAndMidnightProvider(ctx);
  const zkConfigProvider = new NodeZkConfigProvider<any>(contractConfig.ageVerifierZkPath);
  return {
    privateStateProvider: levelPrivateStateProvider<any>({
      privateStateStoreName: `${contractConfig.privateStateStoreName}-age-verifier`,
      walletProvider: walletAndMidnightProvider,
    }),
    publicDataProvider: indexerPublicDataProvider(config.indexer, config.indexerWS),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(config.proofServer, zkConfigProvider),
    walletProvider: walletAndMidnightProvider,
    midnightProvider: walletAndMidnightProvider,
  };
};

export const configureCredentialRegistryProviders = async (ctx: WalletContext, config: Config): Promise<CredentialRegistryProviders> => {
  const walletAndMidnightProvider = await createWalletAndMidnightProvider(ctx);
  const zkConfigProvider = new NodeZkConfigProvider<any>(contractConfig.credentialRegistryZkPath);
  return {
    privateStateProvider: levelPrivateStateProvider<any>({
      privateStateStoreName: `${contractConfig.privateStateStoreName}-credential-registry`,
      walletProvider: walletAndMidnightProvider,
    }),
    publicDataProvider: indexerPublicDataProvider(config.indexer, config.indexerWS),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(config.proofServer, zkConfigProvider),
    walletProvider: walletAndMidnightProvider,
    midnightProvider: walletAndMidnightProvider,
  };
};

// ─── Contract Deployment ────────────────────────────────────────────────────

export const deployAgeVerifier = async (
  providers: AgeVerifierProviders,
  privateState: AgeVerifierPrivateState,
): Promise<DeployedAgeVerifierContract> => {
  logger?.info('Deploying age-verifier contract...');
  const contract = await deployContract(providers as any, {
    compiledContract: ageVerifierCompiledContract as any,
    privateStateId: AgeVerifierPrivateStateId,
    initialPrivateState: privateState,
  } as any);
  logger?.info(`Deployed age-verifier at: ${contract.deployTxData.public.contractAddress}`);
  return contract;
};

export const joinAgeVerifier = async (
  providers: AgeVerifierProviders,
  contractAddress: string,
): Promise<DeployedAgeVerifierContract> => {
  assertIsContractAddress(contractAddress);
  const contract = await findDeployedContract(providers as any, {
    contractAddress,
    compiledContract: ageVerifierCompiledContract as any,
    privateStateId: AgeVerifierPrivateStateId,
    initialPrivateState: { birthYear: 2000, currentYear: 2026 },
  } as any);
  logger?.info(`Joined age-verifier at: ${contract.deployTxData.public.contractAddress}`);
  return contract;
};

export const deployCredentialRegistry = async (
  providers: CredentialRegistryProviders,
  privateState: CredentialRegistryPrivateState,
  ownerPubKey: Uint8Array,
): Promise<DeployedCredentialRegistryContract> => {
  logger?.info('Deploying credential-registry contract...');
  const contract = await deployContract(providers as any, {
    compiledContract: credentialRegistryCompiledContract as any,
    privateStateId: CredentialRegistryPrivateStateId,
    initialPrivateState: privateState,
    args: [ownerPubKey],
  } as any);
  logger?.info(`Deployed credential-registry at: ${contract.deployTxData.public.contractAddress}`);
  return contract;
};

export const joinCredentialRegistry = async (
  providers: CredentialRegistryProviders,
  contractAddress: string,
): Promise<DeployedCredentialRegistryContract> => {
  assertIsContractAddress(contractAddress);
  const contract = await findDeployedContract(providers as any, {
    contractAddress,
    compiledContract: credentialRegistryCompiledContract as any,
    privateStateId: CredentialRegistryPrivateStateId,
    initialPrivateState: { secretKey: new Uint8Array(32) },
  } as any);
  logger?.info(`Joined credential-registry at: ${contract.deployTxData.public.contractAddress}`);
  return contract;
};

// ─── Circuit Calls ──────────────────────────────────────────────────────────

export const callVerifyAge = async (
  contract: DeployedAgeVerifierContract,
  minAge: number,
): Promise<{ isVerified: boolean; txHash: string }> => {
  logger?.info(`Calling verifyAge circuit with minAge=${minAge}...`);

  // Call the impure circuit - this generates a ZK proof and submits a transaction
  const txData = await contract.callTx.verifyAge(BigInt(minAge));

  // The circuit result is in txData.private.result (private to caller, not on-chain)
  const isVerified = (txData as any).private?.result as boolean;
  const txHash = txData.public?.txHash || (txData.public as any)?.txId || 'unknown';

  logger?.info(`verifyAge result: ${isVerified}, txHash: ${txHash}`);
  return { isVerified: Boolean(isVerified), txHash };
};

// ─── Contract Queries ───────────────────────────────────────────────────────

export const getAgeVerifierLedgerState = async (
  providers: AgeVerifierProviders,
  contractAddress: ContractAddress,
): Promise<{ round: bigint; verificationCount: bigint } | null> => {
  assertIsContractAddress(contractAddress);
  const contractState = await providers.publicDataProvider.queryContractState(contractAddress);
  if (!contractState) return null;
  const state = AgeVerifier.ledger(contractState.data);
  return { round: state.round, verificationCount: state.verificationCount };
};

export const getCredentialRegistryLedgerState = async (
  providers: CredentialRegistryProviders,
  contractAddress: ContractAddress,
): Promise<{ totalCredentials: bigint; round: bigint; owner: Uint8Array } | null> => {
  assertIsContractAddress(contractAddress);
  const contractState = await providers.publicDataProvider.queryContractState(contractAddress);
  if (!contractState) return null;
  const state = CredentialRegistry.ledger(contractState.data);
  return { totalCredentials: state.totalCredentials, round: state.round, owner: state.owner };
};

// ─── DUST Balance ───────────────────────────────────────────────────────────

export const getDustBalance = async (
  wallet: WalletFacade,
): Promise<{ available: bigint; pending: bigint; availableCoins: number; pendingCoins: number }> => {
  const state = await Rx.firstValueFrom(wallet.state().pipe(Rx.filter((s) => s.isSynced)));
  const available = state.dust.walletBalance(new Date());
  const availableCoins = state.dust.availableCoins.length;
  const pendingCoins = state.dust.pendingCoins.length;
  const pending = state.dust.pendingCoins.reduce((sum, c) => sum + c.initialValue, 0n);
  return { available, pending, availableCoins, pendingCoins };
};

export function setLogger(_logger: Logger) {
  logger = _logger;
}
