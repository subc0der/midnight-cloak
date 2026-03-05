# Midnight Cloak SDK — API Specification

> **Version**: 1.0.0-alpha  
> **Last Updated**: December 2025  
> **Status**: Draft — Subject to change during development

---

## Table of Contents

1. [Installation](#installation)
2. [Quick Start](#quick-start)
3. [Core Package (`@midnight-cloak/core`)](#core-package)
4. [React Package (`@midnight-cloak/react`)](#react-package)
5. [Wallet Package (`@midnight-cloak/wallet`)](#wallet-package)
6. [Verification Types](#verification-types)
7. [Policy Builder](#policy-builder)
8. [Error Handling](#error-handling)
9. [Events](#events)
10. [TypeScript Types](#typescript-types)

---

## Installation

```bash
# Core SDK (required)
npm install @midnight-cloak/core

# React components (optional, for React apps)
npm install @midnight-cloak/react

# Wallet utilities (optional, for wallet development)
npm install @midnight-cloak/wallet
```

### Peer Dependencies

```bash
npm install @midnight-ntwrk/midnight-js  # Midnight.js SDK
```

---

## Quick Start

### Basic Age Verification

```typescript
import { MidnightCloakClient } from '@midnight-cloak/core';

// Initialize client
const client = new MidnightCloakClient({
  network: 'testnet',  // 'testnet' | 'mainnet'
  apiKey: 'your-api-key'
});

// Request verification
async function checkAge() {
  try {
    const result = await client.verify({
      type: 'AGE',
      policy: { minAge: 18 }
    });

    if (result.verified) {
      console.log('User is 18+');
      // Grant access
    } else {
      console.log('Verification failed or denied');
    }
  } catch (error) {
    console.error('Verification error:', error);
  }
}
```

### React Integration

```tsx
import { MidnightCloakProvider, VerifyButton } from '@midnight-cloak/react';

function App() {
  return (
    <MidnightCloakProvider apiKey="your-api-key" network="testnet">
      <VerifyButton
        type="AGE"
        minAge={18}
        onVerified={() => console.log('Verified!')}
        onDenied={() => console.log('Denied')}
      >
        Verify Age to Continue
      </VerifyButton>
    </MidnightCloakProvider>
  );
}
```

---

## Core Package

### `MidnightCloakClient`

Main entry point for the SDK.

#### Constructor

```typescript
new MidnightCloakClient(config: ClientConfig)
```

**ClientConfig**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `network` | `'testnet' \| 'mainnet'` | Yes | Midnight network to use |
| `apiKey` | `string` | Yes | Your Midnight Cloak API key |
| `proofServerUrl` | `string` | No | Custom proof server URL |
| `timeout` | `number` | No | Request timeout in ms (default: 30000) |

> **Note**: Use `MidnightCloakClient` as the main entry point for all SDK operations.

#### Methods

##### `verify(request: VerificationRequest): Promise<VerificationResult>`

Request a verification from the user.

```typescript
const result = await client.verify({
  type: 'AGE',
  policy: { minAge: 21 }
});
```

**VerificationRequest**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `type` | `VerificationType` | Yes* | Verification type |
| `policy` | `PolicyConfig` | Yes* | Policy parameters |
| `customPolicy` | `Policy` | Yes* | Custom policy (alternative to type/policy) |
| `metadata` | `Record<string, string>` | No | Custom metadata for audit |
| `timeout` | `number` | No | Override default timeout |

*Either `type`+`policy` OR `customPolicy` is required.

**VerificationResult**

| Property | Type | Description |
|----------|------|-------------|
| `verified` | `boolean` | Whether verification succeeded |
| `requestId` | `string` | Unique request identifier |
| `timestamp` | `number` | Unix timestamp of verification |
| `proof` | `Proof \| null` | ZK proof (if verified) |
| `error` | `VerificationError \| null` | Error details (if failed) |

##### `getVerificationStatus(requestId: string): Promise<VerificationStatus>`

Check status of a pending verification.

```typescript
const status = await client.getVerificationStatus('req_abc123');
// status.state: 'pending' | 'approved' | 'denied' | 'expired'
```

##### `cancelVerification(requestId: string): Promise<void>`

Cancel a pending verification request.

```typescript
await client.cancelVerification('req_abc123');
```

##### `on(event: string, handler: Function): void`

Subscribe to SDK events.

```typescript
client.on('verification:approved', (result) => {
  console.log('User approved:', result);
});
```

##### `disconnect(): void`

Clean up resources and disconnect.

```typescript
client.disconnect();
```

---

### `Verifier`

Lower-level verification API for custom flows.

```typescript
import { Verifier } from '@midnight-cloak/core';

const verifier = new Verifier(client);

// Create verification request
const request = await verifier.createRequest({
  type: 'TOKEN_BALANCE',
  policy: { token: 'ADA', minBalance: 1000 }
});

// Wait for user response
const result = await verifier.waitForResult(request.id);
```

---

## React Package

### `<MidnightCloakProvider>`

Context provider for React integration.

```tsx
<MidnightCloakProvider
  apiKey="your-api-key"
  network="testnet"
  onError={(error) => console.error(error)}
>
  {children}
</MidnightCloakProvider>
```

**Props**

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `apiKey` | `string` | Yes | Your API key |
| `network` | `'testnet' \| 'mainnet'` | Yes | Network |
| `proofServerUrl` | `string` | No | Custom proof server |
| `onError` | `(error: Error) => void` | No | Global error handler |
| `children` | `ReactNode` | Yes | Child components |

---

### `<VerifyButton>`

Pre-built button component for verification.

```tsx
<VerifyButton
  type="AGE"
  minAge={18}
  onVerified={(result) => handleVerified(result)}
  onDenied={() => handleDenied()}
  onError={(error) => handleError(error)}
  className="my-custom-class"
>
  Verify to Continue
</VerifyButton>
```

**Props**

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `type` | `VerificationType` | Yes | Verification type |
| `minAge` | `number` | Conditional | Required for AGE type |
| `token` | `string` | Conditional | Required for TOKEN_BALANCE |
| `minBalance` | `number` | Conditional | Required for TOKEN_BALANCE |
| `collection` | `string` | Conditional | Required for NFT_OWNERSHIP |
| `policy` | `Policy` | No | Custom policy (overrides type) |
| `onVerified` | `(result: VerificationResult) => void` | No | Success callback |
| `onDenied` | `() => void` | No | User denied callback |
| `onError` | `(error: Error) => void` | No | Error callback |
| `disabled` | `boolean` | No | Disable button |
| `loading` | `boolean` | No | Show loading state |
| `className` | `string` | No | Custom CSS class |
| `children` | `ReactNode` | No | Button content |

---

### `<CredentialGate>`

Gate content behind verification.

```tsx
<CredentialGate
  require={{ type: 'AGE', minAge: 21 }}
  fallback={<AccessDenied />}
  loading={<Spinner />}
>
  <RestrictedContent />
</CredentialGate>
```

**Props**

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `require` | `VerificationRequirement` | Yes | What to verify |
| `fallback` | `ReactNode` | No | Show when unverified |
| `loading` | `ReactNode` | No | Show while verifying |
| `onVerified` | `() => void` | No | Verified callback |
| `persistSession` | `boolean` | No | Remember verification (default: true) |
| `sessionDuration` | `number` | No | Session length in seconds |
| `children` | `ReactNode` | Yes | Protected content |

---

### Hooks

#### `useVerification()`

Hook for custom verification flows.

```tsx
const {
  verify,
  status,
  result,
  error,
  isLoading,
  reset
} = useVerification();

const handleVerify = async () => {
  await verify({ type: 'AGE', minAge: 18 });
};
```

**Returns**

| Property | Type | Description |
|----------|------|-------------|
| `verify` | `(request: VerificationRequest) => Promise<void>` | Start verification |
| `status` | `'idle' \| 'pending' \| 'verified' \| 'denied' \| 'error'` | Current status |
| `result` | `VerificationResult \| null` | Result after completion |
| `error` | `Error \| null` | Error if failed |
| `isLoading` | `boolean` | Is verification in progress |
| `reset` | `() => void` | Reset to initial state |

#### `useMidnightCloak()`

Access the client instance.

```tsx
const client = useMidnightCloak();

// Access client methods directly
await client.verify({ ... });
```

---

## Wallet Package

For wallet developers integrating Midnight Cloak credential support.

### `CredentialManager`

Manage user credentials.

```typescript
import { CredentialManager } from '@midnight-cloak/wallet';

const manager = new CredentialManager({
  storage: 'local',  // 'local' | 'session' | custom StorageAdapter
  encryptionKey: userDerivedKey
});

// Store credential
await manager.store(credential);

// Get all credentials
const credentials = await manager.getAll();

// Get by type
const ageCredentials = await manager.getByType('AGE');

// Delete credential
await manager.delete(credentialId);
```

### `ProofGenerator`

Generate ZK proofs for verification requests.

```typescript
import { ProofGenerator } from '@midnight-cloak/wallet';

const generator = new ProofGenerator({
  proofServerUrl: 'http://localhost:6300'
});

const proof = await generator.generate({
  credential: ageCredential,
  policy: { type: 'AGE', minAge: 18 },
  nonce: request.nonce
});
```

### `RequestHandler`

Handle incoming verification requests.

```typescript
import { RequestHandler } from '@midnight-cloak/wallet';

const handler = new RequestHandler();

handler.onRequest(async (request) => {
  // Show UI to user
  const userApproved = await showApprovalDialog(request);
  
  if (userApproved) {
    const proof = await generateProof(request);
    return { approved: true, proof };
  }
  
  return { approved: false };
});
```

---

## Verification Types

### AGE

Prove user meets age requirement.

```typescript
{
  type: 'AGE',
  policy: {
    minAge: 18  // Required: minimum age in years
  }
}
```

### TOKEN_BALANCE

Prove user holds minimum token balance.

```typescript
{
  type: 'TOKEN_BALANCE',
  policy: {
    token: 'ADA',      // Token symbol or policy ID
    minBalance: 1000   // Minimum balance
  }
}
```

### NFT_OWNERSHIP

Prove user owns NFT from collection.

```typescript
{
  type: 'NFT_OWNERSHIP',
  policy: {
    collection: 'policy_id_here',  // NFT collection policy ID
    minCount: 1                     // Minimum NFTs owned (default: 1)
  }
}
```

### RESIDENCY (Future)

Prove residency without revealing address.

```typescript
{
  type: 'RESIDENCY',
  policy: {
    country: 'US',     // ISO country code
    region: 'CA'       // Optional: state/region code
  }
}
```

---

## Policy Builder

Build complex verification policies with multiple conditions.

```typescript
import { PolicyBuilder } from '@midnight-cloak/core';

// Simple AND policy
const policy = new PolicyBuilder()
  .requireAge(21)
  .and()
  .requireTokenBalance('ADA', 500)
  .build();

// OR policy
const policy = new PolicyBuilder()
  .requireAge(18)
  .or()
  .requireNFT('vip_collection_id')
  .build();

// Complex nested policy
const policy = new PolicyBuilder()
  .group((p) => 
    p.requireAge(21)
     .and()
     .requireResidency('US')
  )
  .or()
  .requireNFT('bypass_pass_collection')
  .build();

// Use the policy
const result = await client.verify({ customPolicy: policy });
```

### Methods

| Method | Description |
|--------|-------------|
| `requireAge(minAge: number)` | Add age requirement |
| `requireTokenBalance(token: string, min: number)` | Add token requirement |
| `requireNFT(collection: string, minCount?: number)` | Add NFT requirement |
| `requireResidency(country: string, region?: string)` | Add residency requirement |
| `and()` | Combine with AND logic |
| `or()` | Combine with OR logic |
| `group(builder: (p: PolicyBuilder) => PolicyBuilder)` | Create nested group |
| `build()` | Build final policy object |

---

## Error Handling

### Error Types

```typescript
import {
  MidnightCloakError,
  VerificationDeniedError,
  VerificationTimeoutError,
  WalletNotConnectedError,
  NetworkError,
  InvalidPolicyError
} from '@midnight-cloak/core';

try {
  await client.verify({ ... });
} catch (error) {
  if (error instanceof VerificationDeniedError) {
    // User denied the request
    console.log('User chose not to verify');
  } else if (error instanceof VerificationTimeoutError) {
    // Request expired
    console.log('Verification request timed out');
  } else if (error instanceof WalletNotConnectedError) {
    // No wallet connected
    console.log('Please connect your wallet');
  } else if (error instanceof NetworkError) {
    // Network/proof server issue
    console.log('Network error, please try again');
  } else if (error instanceof InvalidPolicyError) {
    // Policy configuration error
    console.log('Invalid policy:', error.details);
  } else {
    // Unknown error
    console.error('Unexpected error:', error);
  }
}
```

### Error Codes

| Code | Name | Description |
|------|------|-------------|
| `E001` | `WALLET_NOT_CONNECTED` | No wallet connection |
| `E002` | `VERIFICATION_DENIED` | User denied request |
| `E003` | `VERIFICATION_TIMEOUT` | Request expired |
| `E004` | `INVALID_POLICY` | Policy configuration error |
| `E005` | `CREDENTIAL_NOT_FOUND` | User lacks required credential |
| `E006` | `PROOF_GENERATION_FAILED` | ZK proof generation error |
| `E007` | `NETWORK_ERROR` | Network/server error |
| `E008` | `CONTRACT_ERROR` | Smart contract error |

---

## Events

Subscribe to SDK events for real-time updates.

```typescript
// Verification lifecycle
client.on('verification:requested', (request) => { ... });
client.on('verification:pending', (request) => { ... });
client.on('verification:approved', (result) => { ... });
client.on('verification:denied', (request) => { ... });
client.on('verification:expired', (request) => { ... });
client.on('verification:error', (error, request) => { ... });

// Wallet events
client.on('wallet:connected', (address) => { ... });
client.on('wallet:disconnected', () => { ... });

// Network events
client.on('network:changed', (network) => { ... });
client.on('network:error', (error) => { ... });
```

---

## TypeScript Types

### Core Types

```typescript
// Verification types
type VerificationType = 
  | 'AGE'
  | 'TOKEN_BALANCE'
  | 'NFT_OWNERSHIP'
  | 'RESIDENCY'
  | 'ACCREDITED'
  | 'CREDENTIAL';

// Verification request
interface VerificationRequest {
  type?: VerificationType;
  policy?: PolicyConfig;
  customPolicy?: Policy;
  metadata?: Record<string, string>;
  timeout?: number;
}

// Verification result
interface VerificationResult {
  verified: boolean;
  requestId: string;
  timestamp: number;
  proof: Proof | null;
  error: VerificationError | null;
}

// Policy configuration (per-type)
type PolicyConfig = 
  | { minAge: number }                              // AGE
  | { token: string; minBalance: number }           // TOKEN_BALANCE
  | { collection: string; minCount?: number }       // NFT_OWNERSHIP
  | { country: string; region?: string };           // RESIDENCY

// Credential
interface Credential {
  id: string;
  type: CredentialType;
  issuer: Address;
  subject: Address;
  claims: Record<string, unknown>;
  issuedAt: number;
  expiresAt: number | null;
  signature: Uint8Array;
}

// Proof
interface Proof {
  type: 'zk-snark';
  data: Uint8Array;
  publicInputs: unknown[];
  verificationKey: string;
}
```

### Network Types

```typescript
type Network = 'testnet' | 'mainnet';

type Address = string;  // Midnight Bech32m address

interface ClientConfig {
  network: Network;
  apiKey: string;
  proofServerUrl?: string;
  timeout?: number;
}
```

---

## Rate Limits & Pricing

### Free Tier
- 100 verifications/month
- Testnet only
- Community support

### Starter ($49/mo)
- 1,000 verifications/month
- Mainnet access
- Email support

### Growth ($199/mo)
- 10,000 verifications/month
- Priority support
- Custom policies

### Enterprise (Custom)
- Unlimited verifications
- SLA guarantee
- Dedicated support
- White-label options

### Overage
- $0.10 per verification over limit

---

## Changelog

### v1.0.0-alpha (December 2025)
- Initial alpha release
- AGE verification support
- Basic React components
- Testnet only

---

*For questions or support, contact: support@midnight-cloak.xyz*
