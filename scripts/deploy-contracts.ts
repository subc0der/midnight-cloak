/**
 * Contract Deployment Script
 *
 * Deploys Midnight Cloak contracts to Preprod network.
 *
 * Prerequisites:
 * 1. Proof server running: docker-compose up -d
 * 2. Wallet seed phrase in MIDNIGHT_SEED environment variable
 * 3. tDUST in wallet (get from faucet)
 *
 * Usage:
 *   MIDNIGHT_SEED="your twelve word seed phrase here" pnpm deploy
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

function log(msg: string, color = colors.reset) {
  console.log(`${color}${msg}${colors.reset}`);
}

function success(msg: string) {
  log(`✓ ${msg}`, colors.green);
}

function warn(msg: string) {
  log(`⚠ ${msg}`, colors.yellow);
}

function error(msg: string) {
  log(`✗ ${msg}`, colors.red);
}

function info(msg: string) {
  log(`  ${msg}`, colors.dim);
}

// Network configuration
const PREPROD_CONFIG = {
  networkId: 'preprod',
  indexer: 'https://indexer.preprod.midnight.network/api/v3/graphql',
  indexerWS: 'wss://indexer.preprod.midnight.network/api/v3/graphql/ws',
  node: 'https://rpc.preprod.midnight.network',
  proofServer: 'http://127.0.0.1:6300',
};

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

async function checkProofServer(): Promise<boolean> {
  try {
    const response = await fetch(`${PREPROD_CONFIG.proofServer}/version`);
    if (response.ok) {
      const version = await response.text();
      success(`Proof server running (version: ${version.trim() || 'unknown'})`);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

async function checkIndexer(): Promise<boolean> {
  try {
    const response = await fetch(PREPROD_CONFIG.indexer, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '{ __typename }' }),
    });
    if (response.ok) {
      success('Indexer available');
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function loadSeedPhrase(): string | null {
  // Try environment variable first
  const seed = process.env.MIDNIGHT_SEED;
  if (seed) {
    return seed.trim();
  }

  // Try .env file
  const envPath = path.join(PROJECT_ROOT, '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    const match = envContent.match(/MIDNIGHT_SEED=["']?(.+?)["']?$/m);
    if (match) {
      return match[1].trim();
    }
  }

  // Try .env.local
  const envLocalPath = path.join(PROJECT_ROOT, '.env.local');
  if (fs.existsSync(envLocalPath)) {
    const envContent = fs.readFileSync(envLocalPath, 'utf-8');
    const match = envContent.match(/MIDNIGHT_SEED=["']?(.+?)["']?$/m);
    if (match) {
      return match[1].trim();
    }
  }

  return null;
}

async function main() {
  console.log('\n' + '='.repeat(60));
  log('  Midnight Cloak Contract Deployment', colors.cyan);
  console.log('='.repeat(60) + '\n');

  log(`Network: ${PREPROD_CONFIG.networkId}`, colors.dim);
  log(`Indexer: ${PREPROD_CONFIG.indexer}`, colors.dim);
  log(`Proof Server: ${PREPROD_CONFIG.proofServer}`, colors.dim);
  console.log();

  // Check prerequisites
  log('Checking prerequisites...', colors.cyan);

  const proofServerOk = await checkProofServer();
  if (!proofServerOk) {
    error('Proof server not running');
    info('Start with: docker-compose up -d');
    info('Or: docker run -d -p 6300:6300 midnightntwrk/proof-server:7.0.0 midnight-proof-server -v');
    process.exit(1);
  }

  const indexerOk = await checkIndexer();
  if (!indexerOk) {
    error('Cannot reach indexer');
    info('Check your internet connection');
    process.exit(1);
  }

  // Check for seed phrase
  const seedPhrase = loadSeedPhrase();
  if (seedPhrase) {
    success('Seed phrase found');
    const wordCount = seedPhrase.split(/\s+/).length;
    info(`Word count: ${wordCount}`);
  } else {
    warn('No seed phrase found');
    info('Set MIDNIGHT_SEED environment variable or add to .env file');
  }

  // Check compiled contracts exist
  const ageVerifierPath = path.join(PROJECT_ROOT, 'packages/contracts/src/managed/age-verifier/contract/index.js');
  const credRegistryPath = path.join(PROJECT_ROOT, 'packages/contracts/src/managed/credential-registry/contract/index.js');

  if (fs.existsSync(ageVerifierPath)) {
    success('age-verifier contract compiled');
  } else {
    error('age-verifier contract not compiled');
    info('Run: wsl -e bash -c "source ~/.local/bin/env && cd /mnt/c/Users/mkhal/dev/midnight-cloak/packages/contracts && compact compile src/age-verifier.compact src/managed/age-verifier"');
    process.exit(1);
  }

  if (fs.existsSync(credRegistryPath)) {
    success('credential-registry contract compiled');
  } else {
    warn('credential-registry contract not compiled');
  }

  console.log('\n' + '-'.repeat(60));
  log('\nDeployment Status', colors.cyan);
  console.log();

  // Due to Midnight SDK module resolution issues with tsx, deployment needs
  // to be done through a different mechanism. Options:
  //
  // 1. Use the Midnight example-hello-world project structure
  // 2. Deploy via a browser-based tool
  // 3. Create a separate deployment project with proper ESM setup
  //
  // For now, we provide instructions for manual deployment.

  warn('Automated deployment requires additional SDK setup');
  console.log();
  log('Manual deployment steps:', colors.cyan);
  console.log();
  info('1. Ensure Lace Midnight wallet is connected to Preprod');
  info('2. Get tDUST from https://faucet.preprod.midnight.network');
  info('3. Use the Midnight example-hello-world as a deployment template:');
  info('   https://github.com/midnightntwrk/example-hello-world');
  console.log();
  info('4. Copy contract files to example project:');
  info('   - packages/contracts/src/managed/age-verifier/');
  info('   - packages/contracts/src/age-verifier-witnesses.ts');
  console.log();
  info('5. Adapt the example\'s deployment script for age-verifier');
  console.log();

  log('Contract files ready for deployment:', colors.cyan);
  console.log();
  info(`Age Verifier: ${ageVerifierPath}`);
  info(`Credential Registry: ${credRegistryPath}`);
  console.log();

  // Save a deployment guide
  const guideContent = `# Contract Deployment Guide

## Prerequisites Verified
- [x] Proof server: Running
- [x] Indexer: Available
- [${seedPhrase ? 'x' : ' '}] Seed phrase: ${seedPhrase ? 'Configured' : 'Not set'}
- [x] age-verifier: Compiled
- [${fs.existsSync(credRegistryPath) ? 'x' : ' '}] credential-registry: ${fs.existsSync(credRegistryPath) ? 'Compiled' : 'Not compiled'}

## Network Configuration
- Network: ${PREPROD_CONFIG.networkId}
- Indexer: ${PREPROD_CONFIG.indexer}
- Proof Server: ${PREPROD_CONFIG.proofServer}

## Deployment Steps

### Option A: Use Midnight Example Project

1. Clone https://github.com/midnightntwrk/example-hello-world
2. Copy compiled contract from:
   \`packages/contracts/src/managed/age-verifier/\`
3. Copy witnesses from:
   \`packages/contracts/src/age-verifier-witnesses.ts\`
4. Adapt the deployment script
5. Run deployment

### Option B: Browser-Based Deployment

Use the Midnight DApp connector with Lace wallet for deployment.
This requires a browser environment.

## After Deployment

1. Copy the contract address
2. Update \`packages/contracts/src/index.ts\`:
   \`\`\`typescript
   export const CONTRACT_ADDRESSES = {
     preprod: {
       ageVerifier: 'YOUR_CONTRACT_ADDRESS_HERE',
       credentialRegistry: '',
     },
     // ...
   };
   \`\`\`
3. Rebuild: \`pnpm build\`
4. Test with demo app: \`pnpm dev\`

Generated: ${new Date().toISOString()}
`;

  const guidePath = path.join(PROJECT_ROOT, 'DEPLOYMENT_GUIDE.md');
  fs.writeFileSync(guidePath, guideContent);
  success(`Deployment guide saved to ${guidePath}`);

  console.log('\n' + '='.repeat(60));
  log('  Prerequisites Check Complete', colors.green);
  console.log('='.repeat(60) + '\n');
}

main().catch((err) => {
  error(`Unexpected error: ${err.message}`);
  console.error(err);
  process.exit(1);
});
