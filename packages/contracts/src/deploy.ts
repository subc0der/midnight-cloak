/**
 * MaskID Contract Deployment Script
 *
 * Deploys the age-verifier contract to Midnight testnet.
 *
 * Usage:
 *   pnpm --filter @maskid/contracts deploy:testnet
 *
 * Prerequisites:
 *   - Docker running with proof server
 *   - Wallet seed with tDUST tokens
 */

import { webcrypto } from 'crypto';
import { stdin as input, stdout as output } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { WebSocket } from 'ws';

// Polyfills for Midnight SDK
// @ts-expect-error: Required for WebSocket usage
globalThis.WebSocket = WebSocket;
if (!globalThis.crypto) {
  // @ts-expect-error: Required for crypto usage
  globalThis.crypto = webcrypto;
}

// Midnight SDK imports
import { deployContract } from '@midnight-ntwrk/midnight-js-contracts';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { WalletBuilder, type Resource } from '@midnight-ntwrk/wallet';
import { type Wallet } from '@midnight-ntwrk/wallet-api';
import { nativeToken, Transaction, type CoinInfo, type TransactionId } from '@midnight-ntwrk/ledger';
import { Transaction as ZswapTransaction } from '@midnight-ntwrk/zswap';
import {
  createBalancedTx,
  type BalancedTransaction,
  type UnbalancedTransaction,
  type WalletProvider,
  type MidnightProvider,
} from '@midnight-ntwrk/midnight-js-types';
import { getLedgerNetworkId, getZswapNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import * as Rx from 'rxjs';
import pino from 'pino';

// Testnet configuration
const TESTNET_CONFIG = {
  indexer: 'https://indexer.testnet.midnight.network/api/v1/graphql',
  indexerWS: 'wss://indexer.testnet.midnight.network/api/v1/graphql',
  node: 'https://rpc.testnet.midnight.network',
  proofServer: 'http://localhost:6300',
};

const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: { colorize: true },
  },
});

async function createWalletProvider(wallet: Wallet): Promise<WalletProvider & MidnightProvider> {
  const state = await Rx.firstValueFrom(wallet.state());
  return {
    coinPublicKey: state.coinPublicKey,
    encryptionPublicKey: state.encryptionPublicKey,
    async balanceTx(tx: UnbalancedTransaction, newCoins: CoinInfo[]): Promise<BalancedTransaction> {
      const zswapTx = ZswapTransaction.deserialize(tx.serialize(getLedgerNetworkId()), getZswapNetworkId());
      const balanced = await wallet.balanceTransaction(zswapTx, newCoins);
      const proved = await wallet.proveTransaction(balanced);
      const ledgerTx = Transaction.deserialize(proved.serialize(getZswapNetworkId()), getLedgerNetworkId());
      return createBalancedTx(ledgerTx);
    },
    submitTx(tx: BalancedTransaction): Promise<TransactionId> {
      return wallet.submitTransaction(tx);
    },
  };
}

async function waitForFunds(wallet: Wallet): Promise<bigint> {
  logger.info('Waiting for wallet to sync and have funds...');
  return Rx.firstValueFrom(
    wallet.state().pipe(
      Rx.throttleTime(5_000),
      Rx.tap((state) => {
        const balance = state.balances[nativeToken()] ?? 0n;
        logger.info(`Sync progress: ${state.syncProgress?.synced ? 'synced' : 'syncing'}, balance: ${balance}`);
      }),
      Rx.filter((state) => state.syncProgress?.synced === true),
      Rx.map((s) => s.balances[nativeToken()] ?? 0n),
      Rx.filter((balance) => balance > 0n),
    ),
  );
}

async function buildWallet(seed: string): Promise<Wallet & Resource> {
  logger.info('Building wallet from seed...');

  const wallet = await WalletBuilder.build(
    TESTNET_CONFIG.indexer,
    TESTNET_CONFIG.indexerWS,
    TESTNET_CONFIG.proofServer,
    TESTNET_CONFIG.node,
    seed,
    'warn',
  );

  const balance = await waitForFunds(wallet);
  logger.info(`Wallet ready with balance: ${balance} tDUST`);

  return wallet;
}

async function main() {
  const rli = createInterface({ input, output, terminal: true });

  console.log('\n=== MaskID Contract Deployment ===\n');
  console.log('This script will deploy the age-verifier contract to Midnight testnet.\n');

  // Get wallet seed
  const seed = await rli.question('Enter your wallet seed (64 hex chars): ');

  if (seed.length !== 64 || !/^[0-9a-fA-F]+$/.test(seed)) {
    console.error('Invalid seed format. Must be 64 hexadecimal characters.');
    process.exit(1);
  }

  try {
    // Build wallet
    const wallet = await buildWallet(seed);

    // Create providers
    logger.info('Setting up providers...');

    const publicDataProvider = indexerPublicDataProvider(
      TESTNET_CONFIG.indexer,
      TESTNET_CONFIG.indexerWS,
    );

    const proofProvider = httpClientProofProvider(TESTNET_CONFIG.proofServer);

    const zkConfigProvider = new NodeZkConfigProvider(
      './managed/age-verifier/zkir',
    );

    const privateStateProvider = levelPrivateStateProvider('./private-state');

    const walletProvider = await createWalletProvider(wallet);

    const providers = {
      publicDataProvider,
      proofProvider,
      zkConfigProvider,
      privateStateProvider,
      walletProvider,
    };

    // Import the compiled contract
    logger.info('Loading compiled contract...');
    const contractModule = await import('../managed/age-verifier/contract/index.cjs');

    // Deploy
    logger.info('Deploying age-verifier contract...');
    logger.info('This may take 30-60 seconds...');

    const deployedContract = await deployContract(providers, {
      contract: new contractModule.Contract({}),
      privateStateId: 'ageVerifierState',
      initialPrivateState: {},
    });

    const contractAddress = deployedContract.deployTxData.public.contractAddress;

    console.log('\n=== Deployment Successful ===');
    console.log(`Contract Address: ${contractAddress}`);
    console.log('\nSave this address! You will need it to interact with the contract.\n');

    // Clean up
    wallet.close();
    await privateStateProvider.close();

  } catch (error) {
    logger.error('Deployment failed:', error);
    process.exit(1);
  } finally {
    rli.close();
  }
}

main().catch(console.error);
