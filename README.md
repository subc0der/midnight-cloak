# MaskID

Zero-knowledge identity verification SDK for the Midnight blockchain.

MaskID enables applications to verify user attributes (age, credentials, token holdings) without exposing the underlying personal data. Users prove claims about themselves while maintaining privacy.

## Status

**Phase 2: Core SDK MVP** - Development in progress

| Component | Status |
|-----------|--------|
| @maskid/core | Available (mock mode) |
| @maskid/react | Available |
| @maskid/contracts | Placeholder |
| Testnet deployment | Blocked (awaiting tDUST) |

## Features

- Age verification without revealing birthdate
- Credential ownership proofs
- Token balance verification (planned)
- NFT ownership verification (planned)
- CIP-30 wallet integration (Lace, NuFi, Vespr)
- React components for common verification flows
- Mock mode for development without wallet

## Packages

```
packages/
  core/           @maskid/core      Core SDK and verification logic
  react/          @maskid/react     React components and hooks
  contracts/      @maskid/contracts Contract types (placeholder)
  wallet/         @maskid/wallet    Wallet utilities (planned)
apps/
  demo/           Demo application
```

## Installation

```bash
npm install @maskid/core @maskid/react
```

## Quick Start

### Basic Age Verification

```typescript
import { MaskIDClient } from '@maskid/core';

const client = new MaskIDClient({
  network: 'testnet',
  apiKey: 'your-api-key'
});

// Connect wallet
await client.connectWallet('lace');

// Verify age
const result = await client.verify({
  type: 'AGE',
  policy: { minAge: 18 }
});

if (result.verified) {
  // User proved they are 18+ without revealing birthdate
}
```

### React Components

```tsx
import { MaskIDProvider, VerifyButton, CredentialGate } from '@maskid/react';

function App() {
  return (
    <MaskIDProvider apiKey="your-api-key" network="testnet">
      {/* Simple verification button */}
      <VerifyButton
        type="AGE"
        minAge={18}
        onVerified={(result) => console.log('Verified:', result)}
      >
        Verify Age
      </VerifyButton>

      {/* Gate content behind verification */}
      <CredentialGate
        require={{ type: 'AGE', minAge: 21 }}
        fallback={<p>Verification required</p>}
      >
        <RestrictedContent />
      </CredentialGate>
    </MaskIDProvider>
  );
}
```

### Development Mode (No Wallet)

```typescript
const client = new MaskIDClient({
  network: 'testnet',
  apiKey: 'demo-key'
});

// Use mock wallet for testing
client.useMockWallet({ network: 'testnet' });

// Verification works without a real wallet
const result = await client.verify({
  type: 'AGE',
  policy: { minAge: 18 }
});
```

## API Reference

### MaskIDClient

```typescript
new MaskIDClient(config: ClientConfig)

interface ClientConfig {
  network: 'testnet' | 'mainnet';
  apiKey: string;
  proofServerUrl?: string;
  timeout?: number;
  preferredWallet?: 'lace' | 'nami' | 'nufi' | 'vespr';
}
```

**Methods:**

| Method | Description |
|--------|-------------|
| `verify(request)` | Perform verification |
| `connectWallet(type?)` | Connect to wallet |
| `disconnectWallet()` | Disconnect wallet |
| `isWalletConnected()` | Check connection status |
| `useMockWallet(options?)` | Enable mock mode |
| `on(event, handler)` | Subscribe to events |
| `off(event, handler)` | Unsubscribe from events |

### PolicyBuilder

```typescript
import { PolicyBuilder } from '@maskid/core';

const policy = new PolicyBuilder()
  .requireAge(21)
  .and()
  .requireTokenBalance('ADA', 1000)
  .build();
```

### React Components

**MaskIDProvider** - Context provider for SDK client

```tsx
<MaskIDProvider
  apiKey="key"
  network="testnet"
  onError={(err) => console.error(err)}
>
  {children}
</MaskIDProvider>
```

**VerifyButton** - One-click verification button

```tsx
<VerifyButton
  type="AGE"
  minAge={18}
  onVerified={(result) => {}}
  onDenied={() => {}}
  onVerificationError={(error) => {}}
/>
```

**CredentialGate** - Conditionally render content based on verification

```tsx
<CredentialGate
  require={{ type: 'AGE', minAge: 21 }}
  persistSession={true}
  sessionDuration={3600}
  loading={<Spinner />}
  fallback={({ verify, error }) => (
    <button onClick={verify}>Verify to continue</button>
  )}
>
  <ProtectedContent />
</CredentialGate>
```

### Error Codes

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

## Development

### Prerequisites

- Node.js 18+
- pnpm 8+

### Setup

```bash
git clone https://github.com/subc0der/MaskID.git
cd MaskID
pnpm install
```

### Build

```bash
# Build all packages
pnpm build

# Build specific package
pnpm --filter @maskid/core build
pnpm --filter @maskid/react build
```

### Test

```bash
# Run all tests
pnpm test

# Run specific package tests
pnpm --filter @maskid/core test

# Watch mode
pnpm --filter @maskid/core test:watch
```

### Demo App

```bash
pnpm dev
```

Opens demo application at `http://localhost:5173`

## Project Structure

```
maskid/
  packages/
    core/                 Core SDK
      src/
        client.ts         Main client class
        verifier.ts       Verification logic
        policy-builder.ts Policy construction
        wallet-connector.ts Wallet integration
        errors.ts         Error definitions
        types.ts          TypeScript types
    react/                React integration
      src/
        components/
          MaskIDProvider.tsx  Context provider
          VerifyButton.tsx    Verification button
          CredentialGate.tsx  Content gating
        hooks/
          useMaskID.ts        Client hook
    contracts/            Contract interfaces
  apps/
    demo/                 Demo application
```

## Technology

| Layer | Technology |
|-------|------------|
| Smart Contracts | Compact (Midnight ZK language) |
| SDK | TypeScript |
| React Components | React 18+ |
| Wallet Integration | CIP-30 (Cardano) |
| Network | Midnight Testnet / Mainnet |

## Roadmap

1. **Phase 1** - Foundation (Complete)
   - Environment setup
   - Architecture design

2. **Phase 2** - Core SDK MVP (Current)
   - Age verification flow
   - React components
   - Mock wallet for development

3. **Phase 3** - Wallet Extension
   - Chrome extension
   - Credential storage
   - Multi-wallet support

4. **Phase 4** - Additional Verifications
   - Token balance verification
   - NFT ownership verification
   - Residency verification

5. **Phase 5** - Production
   - Mainnet deployment
   - Developer dashboard
   - Partner integrations

## License

MIT
