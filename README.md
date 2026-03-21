# Midnight Cloak

> This project is built on the Midnight Network.

Zero-knowledge identity verification infrastructure for [Midnight](https://midnight.network).

**Prove who you are without revealing who you are.**

Midnight Cloak enables dApp developers to verify user attributes (age, credentials, token holdings) using zero-knowledge proofs on the Midnight blockchain. Users prove facts about themselves without exposing underlying personal data.

## Status

**Phase 4: Mainnet Preparation** - Beta Preview

> **Beta Notice:** This SDK currently uses mock proofs. Real ZK proofs will be enabled once Midnight SDK browser patterns stabilize post-mainnet (est. mid-April 2026). The verification UX is fully functional.

| Component | Status | Notes |
|-----------|--------|-------|
| @midnight-cloak/core | 0.2.0 | 15 tests passing |
| @midnight-cloak/react | 0.1.0 | 56 tests passing |
| @midnight-cloak/wallet | 0.1.0 | 70 tests passing |
| Wallet Extension | 0.1.0 | 217 tests passing |
| Contracts | Deployed | Age Verifier + Credential Registry on Preprod |
| Lace/Eternl Wallets | Working | Multi-wallet support |
| ZK Proofs | Beta | Mock proofs (real proofs awaiting SDK support) |

## Features

- Age verification without revealing birthdate
- Credential ownership proofs
- Token balance verification (planned - awaiting bridge)
- NFT ownership verification (planned - awaiting bridge)
- Midnight wallet integration (Lace, Eternl)
- React components for common verification flows
- Mock mode for development without wallet
- Chrome extension for credential management

## Packages

```
packages/
  core/             @midnight-cloak/core      Core SDK and verification logic
  react/            @midnight-cloak/react     React components and hooks
  wallet/           @midnight-cloak/wallet    Wallet utilities
  wallet-extension/ Chrome extension          Credential wallet with Lace integration
  contracts/        @midnight-cloak/contracts Contract types
apps/
  demo/             Demo application
```

## Installation

```bash
npm install @midnight-cloak/core @midnight-cloak/react
```

## Quick Start

### Basic Age Verification

```typescript
import { MidnightCloakClient } from '@midnight-cloak/core';

const client = new MidnightCloakClient({ network: 'preprod' });

// Connect Lace Midnight wallet
await client.connectWallet('lace');

// Verify age (user signs with wallet, ZK proof generated)
const result = await client.verify({
  type: 'AGE',
  policy: { kind: 'age', minAge: 18 }
});

if (result.verified) {
  // User proved they are 18+ without revealing birthdate
}
```

### React Components

```tsx
import { MidnightCloakProvider, VerifyButton, CredentialGate } from '@midnight-cloak/react';

function App() {
  return (
    <MidnightCloakProvider network="preprod">
      {/* Simple verification button */}
      <VerifyButton
        policy={{ kind: 'age', minAge: 18 }}
        onVerified={(result) => console.log('Verified:', result)}
      >
        Verify Age (18+)
      </VerifyButton>

      {/* Gate content behind verification */}
      <CredentialGate
        policy={{ kind: 'age', minAge: 21 }}
        fallback={({ verify }) => (
          <button onClick={verify}>Verify to continue</button>
        )}
      >
        <RestrictedContent />
      </CredentialGate>
    </MidnightCloakProvider>
  );
}
```

### Development Mode (No Wallet)

```typescript
const client = new MidnightCloakClient({ network: 'preprod' });

// Use mock wallet for testing (disabled in production)
client.useMockWallet({ network: 'preprod' });

// Verification works without a real wallet
const result = await client.verify({
  type: 'AGE',
  policy: { kind: 'age', minAge: 18 }
});
```

## API Reference

### MidnightCloakClient

```typescript
new MidnightCloakClient(config: ClientConfig)

interface ClientConfig {
  network: 'preprod' | 'mainnet' | 'standalone';
  apiKey?: string;
  proofServerUrl?: string;  // Default: http://localhost:6300
  timeout?: number;         // Default: 30000ms
  preferredWallet?: 'lace' | 'nufi' | 'vespr';
}
```

**Methods:**

| Method | Description |
|--------|-------------|
| `verify(request)` | Perform ZK verification |
| `connectWallet(type?)` | Connect to Midnight wallet |
| `disconnectWallet()` | Disconnect wallet |
| `isWalletConnected()` | Check connection status |
| `isLaceAvailable()` | Check if Lace is installed |
| `useMockWallet(options?)` | Enable mock mode (dev only) |
| `isProofServerAvailable()` | Check proof server health |
| `on(event, handler)` | Subscribe to events |
| `off(event, handler)` | Unsubscribe from events |

### PolicyBuilder

```typescript
import { PolicyBuilder } from '@midnight-cloak/core';

const policy = new PolicyBuilder()
  .requireAge(21)
  .and()
  .requireTokenBalance('ADA', 1000)
  .build();
```

### React Components

**MidnightCloakProvider** - Context provider for SDK client

```tsx
<MidnightCloakProvider
  network="preprod"
  apiKey="optional-api-key"
  onError={(err) => console.error(err)}
>
  {children}
</MidnightCloakProvider>
```

**VerifyButton** - One-click verification button

```tsx
<VerifyButton
  policy={{ kind: 'age', minAge: 18 }}
  onVerified={(result) => {}}
  onDenied={() => {}}
  onVerificationError={(error) => {}}
>
  Verify Age
</VerifyButton>
```

**CredentialGate** - Conditionally render content based on verification

```tsx
<CredentialGate
  policy={{ kind: 'age', minAge: 21 }}
  persistSession={true}
  sessionDuration={3600}
  loading={<Spinner />}
  fallback={({ verify, error, status }) => (
    <div>
      {error && <p>{error.message}</p>}
      <button onClick={verify}>
        {status === 'error' ? 'Try Again' : 'Verify to continue'}
      </button>
    </div>
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
- Docker (for proof server)
- Lace Midnight wallet (Chrome extension)

### Setup

```bash
git clone <repo-url>
cd midnight-cloak
pnpm install
```

### Start Proof Server

```bash
docker run -d -p 6300:6300 midnightntwrk/proof-server:7.0.0 midnight-proof-server -v

# Verify it's running
curl http://localhost:6300/health
```

### Build

```bash
# Build all packages
pnpm build

# Build specific package
pnpm --filter @midnight-cloak/core build
pnpm --filter @midnight-cloak/react build
```

### Test

```bash
# Run all tests
pnpm test

# Run specific package tests
pnpm --filter @midnight-cloak/core test

# Watch mode
pnpm --filter @midnight-cloak/core test:watch
```

### Demo App

```bash
pnpm dev
```

Opens demo application at `http://localhost:5173`

## Project Structure

```
midnight-cloak/
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
          MidnightCloakProvider.tsx  Context provider
          VerifyButton.tsx    Verification button
          CredentialGate.tsx  Content gating
        hooks/
          useMidnightCloak.ts        Client hook
    wallet-extension/     Chrome extension
      src/
        popup/            Extension UI
        background/       Service worker
        content/          Content scripts and page API
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
| Network | Midnight Preprod / Mainnet |

## Roadmap

1. **Phase 1** - Foundation (Complete)
   - Environment setup
   - Architecture design

2. **Phase 2** - Core SDK MVP (Complete)
   - Age verification flow
   - React components
   - Mock wallet for development
   - Contract deployment to Preprod

3. **Phase 3** - Wallet Extension (Complete)
   - Chrome extension with password-protected vault
   - Argon2id encryption with 12+ character password requirements
   - Lace and Eternl wallet integration
   - Credential management and verification request flows
   - dApp API (`window.midnightCloak`)

4. **Phase 4** - Mainnet Preparation (Current - Beta Preview)
   - 358 tests across all packages
   - Security hardening (password strength, policy validation)
   - Real ZK proofs: Awaiting SDK browser support (est. mid-April 2026)
   - Additional credential types: Awaiting Cardano↔Midnight bridge

5. **Phase 5** - $Handle Shield (Planned)
   - Cardano to Midnight bridge integration (~May-June 2026)
   - $handle claim circuit
   - Asset shielding UI
   - ZK proofs for hidden holdings

6. **Phase 6** - Production & Growth
   - Mainnet deployment
   - Developer dashboard
   - Additional verification types
   - Partner integrations

## Documentation

- [Integration Guide](docs/INTEGRATION.md) - Step-by-step tutorial for dApp developers
- [Core SDK Reference](packages/core/README.md) - Full API documentation
- [React Components](packages/react/README.md) - Component props and hooks
- [Security Architecture](docs/SECURITY.md) - Cryptographic choices and design

## License

Apache 2.0 - See [LICENSE](LICENSE) for details.
