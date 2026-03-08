/**
 * Example: Age Verification with Midnight Cloak SDK
 *
 * This example demonstrates how to use the SDK to verify a user's age.
 *
 * Prerequisites:
 * - Midnight proof server running at localhost:6300
 * - User's wallet connected (Lace)
 *
 * For testing without a real wallet, use the mock wallet in development mode.
 */

import {
  MidnightCloakClient,
  createMockWallet,
  getContractAddresses,
} from '@midnight-cloak/core';

async function main() {
  console.log('Midnight Cloak SDK - Age Verification Example\n');

  // Show deployed contract addresses
  const addresses = getContractAddresses('preprod');
  console.log('Deployed Contracts (preprod):');
  console.log(`  Age Verifier: ${addresses.ageVerifier}`);
  console.log(`  Credential Registry: ${addresses.credentialRegistry}\n`);

  // Initialize the client
  const client = new MidnightCloakClient({
    network: 'preprod',
    timeout: 30000,
  });

  // For testing, use a mock wallet
  // In production, you would connect to Lace via connectWallet()
  const mockWallet = createMockWallet({ network: 'preprod' });
  client.setMockWallet(mockWallet);

  console.log('Verifying user is 18+...\n');

  // Verify age
  const result = await client.verify({
    type: 'AGE',
    policy: { kind: 'age', minAge: 18 },
  });

  if (result.verified) {
    console.log('Verification SUCCESS');
    console.log(`  Request ID: ${result.requestId}`);
    console.log(`  Timestamp: ${new Date(result.timestamp).toISOString()}`);
    if (result.proof) {
      console.log(`  Proof type: ${result.proof.type}`);
      console.log(`  Proof size: ${result.proof.data.length} bytes`);
    }
  } else {
    console.log('Verification FAILED');
    console.log(`  Error: ${result.error?.message}`);
    console.log(`  Code: ${result.error?.code}`);
  }

  // Cleanup
  client.disconnect();
}

main().catch(console.error);
