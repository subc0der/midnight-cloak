# @midnight-cloak/wallet

Credential management utilities for [Midnight Cloak](https://github.com/midnight-cloak).

This package provides tools for managing verifiable credentials, generating ZK proofs, and handling verification requests on the user side.

## Installation

```bash
npm install @midnight-cloak/wallet @midnight-cloak/core
# or
pnpm add @midnight-cloak/wallet @midnight-cloak/core
```

## Overview

This package is designed for:
- **Wallet developers** building credential storage
- **Extension developers** handling verification requests
- **Advanced users** needing direct proof generation

For most dApp integrations, use `@midnight-cloak/core` or `@midnight-cloak/react` instead.

## API Reference

### CredentialManager

Secure storage and retrieval of user credentials.

```typescript
import { CredentialManager } from '@midnight-cloak/wallet';

const manager = new CredentialManager({
  storage: localStorage,  // or sessionStorage, or custom
  onStorageError: (error) => console.error('Storage error:', error),
});

// Store a credential
await manager.store({
  id: 'cred-123',
  type: 'AGE',
  issuer: 'mn_addr_preprod1...',
  subject: 'mn_addr_preprod1...',
  claims: { birthYear: 1990 },
  issuedAt: Date.now(),
  expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000,
  signature: new Uint8Array([...]),
});

// Retrieve credentials
const credentials = await manager.getByType('AGE');
const credential = await manager.getById('cred-123');

// Check validity
const isValid = manager.isValid(credential);

// Remove credential
await manager.remove('cred-123');

// Clear all
await manager.clear();
```

#### Configuration

```typescript
interface CredentialManagerConfig {
  storage?: Storage;                    // Storage backend (default: localStorage)
  encryptionKey?: string;               // Key for encryption (Phase 3)
  onStorageError?: (error: Error) => void;  // Error callback
}
```

### ProofGenerator

Generate ZK proofs for verification requests.

```typescript
import { ProofGenerator } from '@midnight-cloak/wallet';

const generator = new ProofGenerator({
  proofServerUrl: 'http://localhost:6300',
  timeout: 30000,
});

// Generate age proof
const proof = await generator.generateProof({
  type: 'AGE',
  credential: ageCredential,
  policy: { kind: 'age', minAge: 18 },
  requestId: 'req-456',
});

// proof.data contains the ZK-SNARK proof bytes
// proof.publicOutputs contains public inputs
```

#### Proof Request

```typescript
interface ProofRequest {
  type: VerificationType;
  credential: Credential;
  policy: PolicyConfig;
  requestId: string;
}
```

### RequestHandler

Handle incoming verification requests from dApps.

```typescript
import { RequestHandler } from '@midnight-cloak/wallet';

const handler = new RequestHandler({
  credentialManager,
  proofGenerator,
  onRequest: async (request) => {
    // Show UI to user for approval
    const approved = await showApprovalDialog(request);
    return approved;
  },
});

// Process incoming request
const response = await handler.handleRequest({
  type: 'AGE',
  policy: { kind: 'age', minAge: 21 },
  requestId: 'req-789',
  origin: 'https://example.com',
});

if (response.approved) {
  // response.proof contains the generated proof
}
```

#### Verification Response

```typescript
interface VerificationResponse {
  requestId: string;
  approved: boolean;
  proof?: {
    type: 'zk-snark';
    data: Uint8Array;
    publicOutputs: unknown[];
  };
  error?: string;
}
```

## Credential Schema

```typescript
interface Credential {
  id: string;                    // Unique identifier
  type: CredentialType;          // AGE, TOKEN_BALANCE, etc.
  issuer: string;                // Issuer's Midnight address
  subject: string;               // User's Midnight address
  claims: Record<string, any>;   // Credential claims
  issuedAt: number;              // Unix timestamp
  expiresAt: number | null;      // Expiration (null = never)
  signature: Uint8Array;         // Issuer's signature
}

type CredentialType =
  | 'AGE'
  | 'TOKEN_BALANCE'
  | 'NFT_OWNERSHIP'
  | 'RESIDENCY'
  | 'ACCREDITED'
  | 'CREDENTIAL';
```

## Security Considerations

### Current Limitations

- **No encryption at rest** - Credentials stored in plain text (Phase 3 will add encryption)
- **Browser storage** - Uses localStorage/sessionStorage (extension storage in Phase 3)
- **Mock proofs** - Real ZK proofs pending contract deployment

### Best Practices

1. **Never log credentials** - They contain sensitive claims
2. **Clear on logout** - Call `manager.clear()` when user logs out
3. **Validate signatures** - Always verify issuer signatures
4. **Check expiration** - Use `manager.isValid()` before using credentials

## Storage Backends

The CredentialManager accepts any object implementing the Storage interface:

```typescript
// Browser localStorage (default)
new CredentialManager({ storage: localStorage });

// Session storage (cleared on tab close)
new CredentialManager({ storage: sessionStorage });

// Custom storage (e.g., for Chrome extension)
new CredentialManager({
  storage: {
    getItem: (key) => chrome.storage.local.get(key),
    setItem: (key, value) => chrome.storage.local.set({ [key]: value }),
    removeItem: (key) => chrome.storage.local.remove(key),
  }
});
```

## Error Handling

```typescript
import { CredentialManagerError, ProofGenerationError, RequestHandlerError } from '@midnight-cloak/wallet';

try {
  await manager.store(credential);
} catch (error) {
  if (error instanceof CredentialManagerError) {
    console.error('Storage failed:', error.message);
  }
}

try {
  await generator.generateProof(request);
} catch (error) {
  if (error instanceof ProofGenerationError) {
    console.error('Proof failed:', error.message);
  }
}
```

## Future Plans (Phase 3)

- Encryption at rest using Web Crypto API
- Chrome extension storage integration
- Credential import/export
- Multi-device sync
- Hardware wallet support

## License

MIT
