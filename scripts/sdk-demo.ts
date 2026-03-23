/**
 * Midnight Cloak SDK Interactive Demo
 *
 * Run with: npx tsx scripts/sdk-demo.ts
 *
 * This demonstrates all SDK capabilities for testing and showcasing.
 */

import { MidnightCloakClient, PolicyBuilder } from '../packages/core/src/index';

// ANSI colors for pretty output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

function log(msg: string, color = colors.reset) {
  console.log(`${color}${msg}${colors.reset}`);
}

function header(title: string) {
  console.log('\n' + '='.repeat(60));
  log(`  ${title}`, colors.bright + colors.cyan);
  console.log('='.repeat(60) + '\n');
}

function success(msg: string) {
  log(`✓ ${msg}`, colors.green);
}

function info(msg: string) {
  log(`ℹ ${msg}`, colors.blue);
}

function warn(msg: string) {
  log(`⚠ ${msg}`, colors.yellow);
}

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  header('Midnight Cloak SDK Demo');
  log('Zero-knowledge identity verification for Midnight\n', colors.magenta);

  // ============================================
  // 1. Initialize the Client
  // ============================================
  header('1. Initialize Midnight Cloak Client');

  const client = new MidnightCloakClient({
    network: 'testnet',
    apiKey: 'demo-key',
    timeout: 30000,
  });

  success('Client initialized');
  info('Network: testnet');
  info('Timeout: 30000ms');

  // ============================================
  // 2. Set up Event Listeners
  // ============================================
  header('2. Event System');

  client.on('wallet:connected', (wallet) => {
    success(`Wallet connected: ${JSON.stringify(wallet).slice(0, 50)}...`);
  });

  client.on('verification:requested', (request) => {
    info(`Verification requested: ${JSON.stringify(request)}`);
  });

  client.on('verification:approved', () => {
    success(`Verification APPROVED!`);
  });

  client.on('verification:denied', () => {
    warn(`Verification denied`);
  });

  success('Event listeners registered');
  info('Events: wallet:connected, verification:requested, verification:approved, verification:denied');

  // ============================================
  // 3. Connect Mock Wallet
  // ============================================
  header('3. Mock Wallet (Development Mode)');

  info('In production, users connect Lace/Eternl wallets');
  info('For development, we use mock wallet mode\n');

  client.useMockWallet({
    network: 'testnet',
    autoApprove: true  // Auto-approve verifications for demo
  });

  await delay(100); // Let event fire

  // ============================================
  // 4. Simple Age Verification
  // ============================================
  header('4. Age Verification (Simple)');

  info('Proving user is 18+ WITHOUT revealing their actual birthdate\n');

  const ageResult = await client.verify({
    type: 'AGE',
    policy: { minAge: 18 }
  });

  console.log('\nResult:', {
    verified: ageResult.verified,
    requestId: ageResult.requestId,
    timestamp: new Date(ageResult.timestamp).toISOString(),
    hasProof: ageResult.proof !== null,
  });

  // ============================================
  // 5. PolicyBuilder - Complex Policies
  // ============================================
  header('5. PolicyBuilder - Complex Verification Policies');

  info('Build compound verification requirements\n');

  // Example 1: Age AND Token Balance
  const policy1 = new PolicyBuilder()
    .requireAge(21)
    .and()
    .requireTokenBalance('ADA', 1000)
    .build();

  log('\nPolicy 1: Age 21+ AND hold 1000+ ADA', colors.yellow);
  console.log(JSON.stringify(policy1, null, 2));

  // Example 2: NFT OR Accredited Investor
  const policy2 = new PolicyBuilder()
    .requireNFT('midnight-founders', 1)
    .or()
    .requireCredential('ACCREDITED', { minAge: 0 })
    .build();

  log('\nPolicy 2: Own NFT OR be Accredited Investor', colors.yellow);
  console.log(JSON.stringify(policy2, null, 2));

  // Example 3: Residency check
  const policy3 = new PolicyBuilder()
    .requireAge(18)
    .and()
    .requireResidency('US', 'CA')
    .build();

  log('\nPolicy 3: Age 18+ AND California Resident', colors.yellow);
  console.log(JSON.stringify(policy3, null, 2));

  // ============================================
  // 6. Token Balance Verification (Planned)
  // ============================================
  header('6. Token Balance Verification');

  info('Prove user holds minimum token balance without revealing exact amount\n');

  try {
    const tokenResult = await client.verify({
      type: 'TOKEN_BALANCE',
      policy: { token: 'ADA', minBalance: 500 }
    });
    success(`Token verification: ${tokenResult.verified ? 'PASSED' : 'FAILED'}`);
  } catch {
    warn(`TOKEN_BALANCE: Not yet implemented (coming in Phase 4)`);
    info(`Will prove: User holds >= 500 ADA (actual balance hidden)`);
  }

  // ============================================
  // 7. NFT Ownership Verification (Planned)
  // ============================================
  header('7. NFT Ownership Verification');

  info('Prove NFT ownership without revealing wallet address\n');

  try {
    const nftResult = await client.verify({
      type: 'NFT_OWNERSHIP',
      policy: { collection: 'midnight-genesis', minCount: 1 }
    });
    success(`NFT verification: ${nftResult.verified ? 'PASSED' : 'FAILED'}`);
  } catch {
    warn(`NFT_OWNERSHIP: Not yet implemented (coming in Phase 4)`);
    info(`Will prove: User owns >= 1 NFT from collection`);
  }

  // ============================================
  // 8. Verification Types Summary
  // ============================================
  header('8. Supported Verification Types');

  const verificationTypes = [
    { type: 'AGE', desc: 'Prove minimum age without revealing birthdate', status: '✓ Implemented' },
    { type: 'TOKEN_BALANCE', desc: 'Prove token holdings without exact amount', status: '✓ Implemented' },
    { type: 'NFT_OWNERSHIP', desc: 'Prove NFT ownership without wallet address', status: '✓ Implemented' },
    { type: 'RESIDENCY', desc: 'Prove residency without revealing address', status: '◐ Planned' },
    { type: 'ACCREDITED', desc: 'Prove accredited investor status', status: '◐ Planned' },
    { type: 'CREDENTIAL', desc: 'Generic credential verification', status: '◐ Planned' },
  ];

  console.log('\n┌─────────────────┬───────────────────────────────────────────┬──────────────┐');
  console.log('│ Type            │ Description                               │ Status       │');
  console.log('├─────────────────┼───────────────────────────────────────────┼──────────────┤');
  verificationTypes.forEach(v => {
    const type = v.type.padEnd(15);
    const desc = v.desc.slice(0, 41).padEnd(41);
    const status = v.status.padEnd(12);
    console.log(`│ ${type} │ ${desc} │ ${status} │`);
  });
  console.log('└─────────────────┴───────────────────────────────────────────┴──────────────┘');

  // ============================================
  // 9. SDK Architecture
  // ============================================
  header('9. SDK Architecture');

  console.log(`
  ┌─────────────────────────────────────────────────────────────┐
  │                      Your dApp                              │
  └─────────────────────────┬───────────────────────────────────┘
                            │
  ┌─────────────────────────▼───────────────────────────────────┐
  │               @midnight-cloak/react                          │
  │  ┌─────────────┐  ┌───────────────┐  ┌───────────────────┐  │
  │  │VerifyButton │  │CredentialGate │  │MidnightCloakProv. │  │
  │  └─────────────┘  └───────────────┘  └───────────────────┘  │
  └─────────────────────────┬───────────────────────────────────┘
                            │
  ┌─────────────────────────▼───────────────────────────────────┐
  │               @midnight-cloak/core                           │
  │  ┌──────────────────┐  ┌─────────────┐  ┌───────────────┐   │
  │  │MidnightCloakClient│  │PolicyBuilder │  │WalletConnector│   │
  │  └──────────────────┘  └─────────────┘  └───────────────┘   │
  └─────────────────────────┬───────────────────────────────────┘
                            │
  ┌─────────────────────────▼───────────────────────────────────┐
  │              Midnight Network (Preprod/Mainnet)              │
  │                   ZK Proofs via Compact                      │
  └─────────────────────────────────────────────────────────────┘
  `);

  // ============================================
  // 10. Cleanup
  // ============================================
  header('10. Cleanup');

  client.disconnect();
  success('Client disconnected');
  success('Event listeners cleared');

  // ============================================
  // Summary
  // ============================================
  header('Demo Complete!');

  log('This project extends the Midnight Network with additional developer tooling.\n', colors.magenta);

  console.log('Next steps:');
  info('1. Run the demo app: pnpm dev (then open localhost:5173)');
  info('2. Check tests: pnpm test');
  info('3. Review React components in packages/react/src/components/');
  info('4. Study PolicyBuilder for complex verification flows\n');

  log('Repository: github.com/subc0der/midnight-cloak', colors.cyan);
  log('Network: Midnight Preprod', colors.cyan);
}

main().catch(console.error);
