# @midnight-cloak/core

Core SDK for zero-knowledge identity verification on [Midnight](https://midnight.network).

## Installation

```bash
npm install @midnight-cloak/core
# or
pnpm add @midnight-cloak/core
```

## Quick Start

```typescript
import { MidnightCloakClient } from '@midnight-cloak/core';

// Create client
const client = new MidnightCloakClient({ network: 'preprod' });

// Connect Lace Midnight wallet
await client.connectWallet('lace');

// Verify user is 18+
const result = await client.verify({
  type: 'AGE',
  policy: { kind: 'age', minAge: 18 }
});

if (result.verified) {
  console.log('User verified!');
  console.log('Proof:', result.proof);
}
```

## API Reference

### MidnightCloakClient

Main entry point for the SDK.

```typescript
const client = new MidnightCloakClient(config: ClientConfig);

interface ClientConfig {
  network: 'preprod' | 'mainnet' | 'standalone';
  apiKey?: string;
  proofServerUrl?: string;  // Default: http://localhost:6300
  timeout?: number;         // Default: 30000ms
  preferredWallet?: 'lace' | 'nufi' | 'vespr';
  autoReconnect?: boolean;  // Remember last wallet (default: false)
}
```

#### Methods

##### verify(request)

Perform zero-knowledge verification.

```typescript
const result = await client.verify({
  type: 'AGE',
  policy: { kind: 'age', minAge: 21 }
});

// Result structure
interface VerificationResult {
  verified: boolean;
  requestId: string;
  timestamp: number;
  proof: { type: 'zk-snark'; data: Uint8Array } | null;
  error: { code: string; message: string } | null;
}
```

##### connectWallet(type?)

Connect to a Midnight wallet.

```typescript
await client.connectWallet('lace');
// or auto-detect
await client.connectWallet();
```

##### Wallet Methods

```typescript
client.disconnectWallet();
client.isWalletConnected();       // boolean
client.isLaceAvailable();         // boolean
client.getAvailableWallets();     // WalletInfo[]
await client.tryAutoReconnect(); // Reconnect to last wallet
client.getWalletInstallUrl('lace'); // Get install URL
```

##### Network Validation

Check if the connected wallet is on the correct network.

```typescript
const { valid, expected, actual } = await client.validateNetwork();

if (!valid) {
  console.log(`Please switch from ${actual} to ${expected}`);
}
```

##### Wallet Installation Polling

Detect when a user installs the wallet extension.

```typescript
client.pollForWalletInstallation('lace', {
  maxDuration: 120000,  // 2 minutes
  onDetected: () => {
    console.log('Lace wallet installed!');
  }
});

// Stop polling
client.stopInstallPolling();
```

##### useMockWallet(options?)

Enable mock wallet for development (disabled in production).

```typescript
client.useMockWallet({ network: 'preprod' });
```

##### Events

```typescript
client.on('wallet:connected', (wallet) => {
  console.log('Connected:', wallet);
});

client.on('wallet:disconnected', () => {
  console.log('Disconnected');
});

client.on('verification:approved', (result) => {
  console.log('Verified:', result);
});

client.on('verification:denied', (result) => {
  console.log('Denied:', result.error);
});
```

### PolicyBuilder

Fluent API for building verification policies.

```typescript
import { PolicyBuilder } from '@midnight-cloak/core';

const policy = new PolicyBuilder()
  .requireAge(21)
  .build();

// Future: compound policies
const complexPolicy = new PolicyBuilder()
  .requireAge(18)
  .and()
  .requireTokenBalance('NIGHT', 1000)
  .build();
```

### Network Configuration

Pre-configured network settings.

```typescript
import { PreprodConfig, StandaloneConfig, createNetworkConfig } from '@midnight-cloak/core';

// Preprod testnet
const preprod = new PreprodConfig();
console.log(preprod.indexer);  // https://indexer.preprod.midnight.network/...

// Local Docker development
const standalone = new StandaloneConfig();
console.log(standalone.proofServer);  // http://localhost:6300

// Custom configuration
const custom = createNetworkConfig('preprod');
```

### Error Handling

#### User-Friendly Error Guidance

Use `getErrorGuidance()` for actionable error messages.

```typescript
import { getErrorGuidance, isMidnightCloakError } from '@midnight-cloak/core';

try {
  await client.verify({ type: 'AGE', policy: { kind: 'age', minAge: 18 } });
} catch (error) {
  if (isMidnightCloakError(error)) {
    const guidance = getErrorGuidance(error);
    console.log(guidance.title);       // "Wallet Not Connected"
    console.log(guidance.description); // "Please connect your wallet..."
    console.log(guidance.actions);     // [{ type: 'connect-wallet', label: '...' }]
  }
}
```

#### Error Codes

```typescript
import { ErrorCodes } from '@midnight-cloak/core';

const result = await client.verify({ ... });

if (!result.verified) {
  switch (result.error?.code) {
    case ErrorCodes.WALLET_NOT_CONNECTED:
      console.log('Please connect your wallet');
      break;
    case ErrorCodes.VERIFICATION_DENIED:
      console.log('User denied the request');
      break;
    case ErrorCodes.PROOF_GENERATION_FAILED:
      console.log('Proof server error');
      break;
    default:
      console.log(result.error?.message);
  }
}
```

#### Error Codes

| Code | Constant | Description |
|------|----------|-------------|
| E001 | WALLET_NOT_CONNECTED | No wallet connected |
| E002 | VERIFICATION_DENIED | User rejected verification |
| E003 | VERIFICATION_TIMEOUT | Request timed out |
| E004 | INVALID_POLICY | Invalid policy configuration |
| E005 | CREDENTIAL_NOT_FOUND | Required credential not found |
| E006 | PROOF_GENERATION_FAILED | ZK proof generation failed |
| E007 | NETWORK_ERROR | Network request failed |
| E008 | CONTRACT_ERROR | Smart contract error |
| E009 | UNSUPPORTED_VERIFICATION_TYPE | Verification type not implemented |
| E010 | WALLET_ERROR | Wallet operation failed |

### Types

```typescript
import type {
  Network,
  WalletType,
  VerificationType,
  PolicyConfig,
  VerificationRequest,
  VerificationResult,
  ClientConfig,
} from '@midnight-cloak/core';

type Network = 'preprod' | 'mainnet' | 'standalone';
type WalletType = 'lace' | 'nufi' | 'vespr';
type VerificationType = 'AGE' | 'TOKEN_BALANCE' | 'NFT_OWNERSHIP' | 'CREDENTIAL';

type PolicyConfig =
  | { kind: 'age'; minAge: number }
  | { kind: 'token_balance'; token: string; minBalance: number }
  | { kind: 'nft_ownership'; collection: string };
```

## Deployed Contracts

The SDK connects to pre-deployed contracts on preprod testnet.

```typescript
import { getContractAddresses, hasDeployedContracts } from '@midnight-cloak/core';

// Check if contracts are deployed on a network
if (hasDeployedContracts('preprod')) {
  const addresses = getContractAddresses('preprod');
  console.log('Age Verifier:', addresses.ageVerifier);
  console.log('Credential Registry:', addresses.credentialRegistry);
}
```

| Network | Status | Contracts |
|---------|--------|-----------|
| preprod | Deployed | Age Verifier, Credential Registry |
| standalone | Manual | Deploy via deploy-cli |
| mainnet | Pending | Coming late March 2026 |

## Requirements

- **Proof Server**: Local Docker container for ZK proof generation
- **Wallet**: Lace Midnight wallet (Chrome extension)
- **Network**: Preprod testnet (mainnet coming soon)

### Start Proof Server

```bash
docker run -d -p 6300:6300 midnightntwrk/proof-server:7.0.0 midnight-proof-server -v
```

## Current Status

- **Age verification** - Fully implemented with real contracts on preprod
- **Credential registry** - Deployed on preprod, SDK integration in progress
- **ZK proofs** - Generated via proof server (localhost:6300)
- **Networks** - Preprod testnet supported, mainnet coming late March 2026

### Verification Types

| Type | Status |
|------|--------|
| AGE | Implemented |
| TOKEN_BALANCE | Coming soon |
| NFT_OWNERSHIP | Coming soon |
| RESIDENCY | Coming soon |
| CREDENTIAL | Coming soon |

## License

MIT
