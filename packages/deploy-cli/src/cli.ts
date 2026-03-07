// Interactive CLI for Midnight Cloak deployment
// Based on example-counter patterns

import { type WalletContext, type AgeVerifierPrivateState, type CredentialRegistryPrivateState } from './api.js';
import { stdin as input, stdout as output } from 'node:process';
import { createInterface, type Interface } from 'node:readline/promises';
import { type Logger } from 'pino';
import { type Config } from './config.js';
import * as api from './api.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

let logger: Logger;

const BANNER = `
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║              Midnight Cloak Deployment CLI                   ║
║              ────────────────────────────                    ║
║              Zero-knowledge identity verification            ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
`;

const DIVIDER = '──────────────────────────────────────────────────────────────';

const WALLET_MENU = `
${DIVIDER}
  Wallet Setup
${DIVIDER}
  [1] Create a new wallet
  [2] Restore wallet from seed
  [3] Exit
${'─'.repeat(62)}
> `;

const contractMenu = (dustBalance: string) => `
${DIVIDER}
  Contract Operations${dustBalance ? `               DUST: ${dustBalance}` : ''}
${DIVIDER}
  [1] Deploy Age Verifier contract
  [2] Deploy Credential Registry contract
  [3] Join existing Age Verifier
  [4] Join existing Credential Registry
  [5] Call verifyAge circuit
  [6] Check DUST balance
  [7] Exit
${'─'.repeat(62)}
> `;

const formatBalance = (balance: bigint): string => balance.toLocaleString();

const getDustLabel = async (wallet: api.WalletContext['wallet']): Promise<string> => {
  try {
    const dust = await api.getDustBalance(wallet);
    return formatBalance(dust.available);
  } catch {
    return '';
  }
};

const saveDeploymentResult = (contractType: string, address: string) => {
  const resultPath = path.resolve(process.cwd(), 'deployment-result.json');
  let results: Record<string, any> = {};

  try {
    if (fs.existsSync(resultPath)) {
      results = JSON.parse(fs.readFileSync(resultPath, 'utf-8'));
    }
  } catch {
    // Start fresh if file is corrupted
  }

  results[contractType] = {
    address,
    deployedAt: new Date().toISOString(),
    network: 'preprod',
  };

  fs.writeFileSync(resultPath, JSON.stringify(results, null, 2));
  console.log(`  Saved to deployment-result.json`);
};

const buildWallet = async (config: Config, rli: Interface): Promise<WalletContext | null> => {
  while (true) {
    const choice = await rli.question(WALLET_MENU);
    switch (choice.trim()) {
      case '1':
        return await api.buildFreshWallet(config);
      case '2': {
        const seed = await rli.question('Enter your wallet seed (64-char hex): ');
        if (seed.trim().length !== 64) {
          console.log('  Invalid seed length. Expected 64 hex characters.');
          continue;
        }
        return await api.buildWalletAndWaitForFunds(config, seed.trim());
      }
      case '3':
        return null;
      default:
        console.log(`  Invalid choice: ${choice}`);
    }
  }
};

const deploymentLoop = async (
  walletCtx: WalletContext,
  config: Config,
  rli: Interface,
): Promise<void> => {
  while (true) {
    const dustLabel = await getDustLabel(walletCtx.wallet);
    const choice = await rli.question(contractMenu(dustLabel));

    switch (choice.trim()) {
      case '1': {
        // Deploy Age Verifier
        try {
          const providers = await api.withStatus('Configuring Age Verifier providers', () =>
            api.configureAgeVerifierProviders(walletCtx, config)
          );

          const currentYear = new Date().getFullYear();
          const contract = await api.withStatus('Deploying Age Verifier contract', () =>
            api.deployAgeVerifier(providers, { birthYear: 2000, currentYear })
          );

          const address = contract.deployTxData.public.contractAddress;
          console.log(`\n  ✓ Age Verifier deployed at: ${address}\n`);
          saveDeploymentResult('ageVerifier', address);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.log(`\n  ✗ Deploy failed: ${msg}\n`);
          if (e instanceof Error && e.cause) {
            console.log(`    cause: ${e.cause}`);
          }
        }
        break;
      }

      case '2': {
        // Deploy Credential Registry
        try {
          const providers = await api.withStatus('Configuring Credential Registry providers', () =>
            api.configureCredentialRegistryProviders(walletCtx, config)
          );

          // Generate a random owner public key for now (32 bytes)
          const ownerPubKey = new Uint8Array(32);
          crypto.getRandomValues(ownerPubKey);

          const contract = await api.withStatus('Deploying Credential Registry contract', () =>
            api.deployCredentialRegistry(
              providers,
              { secretKey: new Uint8Array(32) },
              ownerPubKey
            )
          );

          const address = contract.deployTxData.public.contractAddress;
          console.log(`\n  ✓ Credential Registry deployed at: ${address}\n`);
          saveDeploymentResult('credentialRegistry', address);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.log(`\n  ✗ Deploy failed: ${msg}\n`);
          if (e instanceof Error && e.cause) {
            console.log(`    cause: ${e.cause}`);
          }
        }
        break;
      }

      case '3': {
        // Join Age Verifier
        const address = await rli.question('Enter Age Verifier contract address: ');
        try {
          const providers = await api.withStatus('Configuring providers', () =>
            api.configureAgeVerifierProviders(walletCtx, config)
          );
          const contract = await api.withStatus('Joining contract', () =>
            api.joinAgeVerifier(providers, address.trim())
          );
          console.log(`\n  ✓ Joined Age Verifier at: ${contract.deployTxData.public.contractAddress}\n`);

          const state = await api.getAgeVerifierLedgerState(providers, address.trim());
          if (state) {
            console.log(`  Round: ${state.round}`);
            console.log(`  Verification Count: ${state.verificationCount}\n`);
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.log(`\n  ✗ Failed to join: ${msg}\n`);
        }
        break;
      }

      case '4': {
        // Join Credential Registry
        const address = await rli.question('Enter Credential Registry contract address: ');
        try {
          const providers = await api.withStatus('Configuring providers', () =>
            api.configureCredentialRegistryProviders(walletCtx, config)
          );
          const contract = await api.withStatus('Joining contract', () =>
            api.joinCredentialRegistry(providers, address.trim())
          );
          console.log(`\n  ✓ Joined Credential Registry at: ${contract.deployTxData.public.contractAddress}\n`);

          const state = await api.getCredentialRegistryLedgerState(providers, address.trim());
          if (state) {
            console.log(`  Total Credentials: ${state.totalCredentials}`);
            console.log(`  Round: ${state.round}\n`);
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.log(`\n  ✗ Failed to join: ${msg}\n`);
        }
        break;
      }

      case '5': {
        // Call verifyAge circuit
        const address = await rli.question('Enter Age Verifier contract address: ');
        const minAgeStr = await rli.question('Enter minimum age to verify (e.g., 18): ');
        const minAge = parseInt(minAgeStr.trim(), 10);

        if (isNaN(minAge) || minAge < 0 || minAge > 255) {
          console.log('  Invalid age. Must be a number between 0 and 255.\n');
          break;
        }

        try {
          const providers = await api.withStatus('Configuring providers', () =>
            api.configureAgeVerifierProviders(walletCtx, config)
          );

          const contract = await api.withStatus('Joining contract', () =>
            api.joinAgeVerifier(providers, address.trim())
          );

          const result = await api.withStatus(`Calling verifyAge(${minAge}) - generating ZK proof`, () =>
            api.callVerifyAge(contract, minAge)
          );

          console.log(`\n  ✓ Verification Result: ${result.isVerified ? 'PASSED' : 'FAILED'}`);
          console.log(`    User is ${result.isVerified ? '>=' : '<'} ${minAge} years old`);
          console.log(`    Tx Hash: ${result.txHash}\n`);

          // Show updated ledger state
          const state = await api.getAgeVerifierLedgerState(providers, address.trim());
          if (state) {
            console.log(`  Updated Ledger State:`);
            console.log(`    Round: ${state.round}`);
            console.log(`    Verification Count: ${state.verificationCount}\n`);
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.log(`\n  ✗ Verification failed: ${msg}\n`);
          if (e instanceof Error && e.cause) {
            console.log(`    cause: ${e.cause}`);
          }
        }
        break;
      }

      case '6': {
        // Check DUST balance
        try {
          const dust = await api.getDustBalance(walletCtx.wallet);
          console.log(`\n  DUST Balance:`);
          console.log(`    Available: ${formatBalance(dust.available)}`);
          console.log(`    Pending:   ${formatBalance(dust.pending)}`);
          console.log(`    Coins:     ${dust.availableCoins} available, ${dust.pendingCoins} pending\n`);
        } catch (e) {
          console.log(`\n  ✗ Failed to get balance\n`);
        }
        break;
      }

      case '7':
        return;

      default:
        console.log(`  Invalid choice: ${choice}`);
    }
  }
};

export const run = async (config: Config, _logger: Logger): Promise<void> => {
  logger = _logger;
  api.setLogger(_logger);

  console.log(BANNER);

  const rli = createInterface({ input, output, terminal: true });

  try {
    const walletCtx = await buildWallet(config, rli);
    if (walletCtx === null) {
      return;
    }

    try {
      await deploymentLoop(walletCtx, config, rli);
    } catch (e) {
      if (e instanceof Error) {
        logger.error(`Error: ${e.message}`);
        logger.debug(`${e.stack}`);
      } else {
        throw e;
      }
    } finally {
      try {
        await walletCtx.wallet.stop();
      } catch (e) {
        logger.error(`Error stopping wallet: ${e}`);
      }
    }
  } finally {
    rli.close();
    rli.removeAllListeners();
    logger.info('Goodbye.');
  }
};
