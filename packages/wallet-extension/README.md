# @midnight-cloak/wallet-extension

Chrome extension for managing zero-knowledge credentials on the Midnight network. Users store credentials locally and approve verification requests from dApps without revealing underlying personal data.

## Overview

The Midnight Cloak extension provides:

- **Secure Credential Storage** - Credentials encrypted with AES-256-GCM, key derived via Argon2id
- **Verification Requests** - Approve/deny ZK proof requests from dApps
- **Credential Offers** - Accept credentials from trusted issuers
- **Lace Wallet Integration** - Uses Lace for network configuration and proof server URIs
- **Auto-Lock** - Configurable timeout for security

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Web Page (dApp)                          │
│  window.midnightCloak.requestVerification({ type: 'AGE', ... }) │
└───────────────────────────────┬─────────────────────────────────┘
                                │ window.postMessage()
┌───────────────────────────────▼─────────────────────────────────┐
│                      Content Script                              │
│  Forwards messages, polls for responses, validates origins       │
└───────────────────────────────┬─────────────────────────────────┘
                                │ chrome.runtime.sendMessage()
┌───────────────────────────────▼─────────────────────────────────┐
│                   Background Service Worker                      │
│  Vault operations, credential management, request queue          │
└───────────────────────────────┬─────────────────────────────────┘
                                │
          ┌─────────────────────┼─────────────────────┐
          ▼                     ▼                     ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  Popup (React)  │  │    Offscreen    │  │  Chrome Storage │
│  User interface │  │  Argon2id/WASM  │  │  Encrypted vault│
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

### Components

| Component | Location | Purpose |
|-----------|----------|---------|
| **Background** | `src/background/` | Service worker handling vault, credentials, requests |
| **Content Script** | `src/content/` | Message bridge between page and extension |
| **Popup** | `src/popup/` | React UI for credential management |
| **Offscreen** | `src/offscreen/` | Argon2id key derivation and ZK proof generation (WASM) |
| **Shared** | `src/shared/` | Storage, messaging types, utilities |

## Installation

### Development Build

```bash
cd packages/wallet-extension
npm install
npm run dev
```

### Production Build

```bash
npm run build
```

### Load in Chrome

1. Open `chrome://extensions`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select the `dist/` folder
5. The Midnight Cloak icon appears in your toolbar

## dApp Integration API

The extension injects `window.midnightCloak` into all web pages.

### Check Installation

```typescript
if (window.midnightCloak?.isInstalled) {
  console.log('Extension version:', window.midnightCloak.version);
}
```

### Request Verification

Request a ZK proof from the user. The extension popup opens for user approval.

```typescript
const result = await window.midnightCloak.requestVerification({
  type: 'AGE',
  minAge: 18
});

if (result.success && result.verified) {
  // User proved they are 18+
  console.log('Proof:', result.proof);
  // proof.isMock indicates if using development mock proofs
}
```

**Parameters:**

| Field | Type | Description |
|-------|------|-------------|
| `type` | `string` | Credential type: `'AGE'`, `'TOKEN_BALANCE'`, `'NFT_OWNERSHIP'`, `'RESIDENCY'` |
| `minAge` | `number` | For AGE type: minimum age required |
| `policy` | `object` | Complex policy configuration (optional) |

**Response:**

```typescript
interface VerificationResponse {
  success: boolean;
  verified?: boolean;
  proof?: {
    type: string;
    verified: boolean;
    timestamp: number;
    proofData: Uint8Array;
    publicOutputs: unknown[];
    isMock: boolean;  // true in development mode
  };
  error?: string;
}
```

### Issue Credential

Offer a credential to the user. The extension popup opens for user acceptance.

```typescript
const result = await window.midnightCloak.issueCredential({
  type: 'AGE',
  claims: { birthDate: '1990-01-15' },
  issuer: 'abcd1234...',  // Your Midnight address
  expiresAt: Date.now() + (365 * 24 * 60 * 60 * 1000)  // 1 year
});

if (result.success) {
  console.log('Credential stored:', result.credentialId);
}
```

**Parameters:**

| Field | Type | Description |
|-------|------|-------------|
| `type` | `string` | Credential type |
| `claims` | `object` | Credential data (e.g., `{ birthDate: '1990-01-15' }`) |
| `issuer` | `string` | Issuer's Midnight address (64-char hex) |
| `expiresAt` | `number` | Expiration timestamp (optional) |

### Get Available Credentials

List credentials the user has (returns limited info for privacy).

```typescript
const credentials = await window.midnightCloak.getAvailableCredentials();
// Returns: [{ id: 'uuid', type: 'AGE' }, ...]
```

### Check Lace Wallet

```typescript
if (window.midnightCloak.isLaceAvailable()) {
  const uris = await window.midnightCloak.getLaceServiceUris();
  console.log('Network:', uris.networkId);
}
```

## Verification Flow

```
1. dApp calls requestVerification()
2. Extension opens popup with request details
3. User sees which credential will be used
4. User clicks Approve or Deny
5. If approved, ZK proof generated
6. Result returned to dApp
```

The extension automatically finds a matching credential based on:
- Credential type matches request type
- Credential is not expired
- Credential satisfies policy (e.g., age >= minAge)

## Credential Offer Flow

```
1. dApp calls issueCredential()
2. Extension opens popup with credential details
3. User sees issuer trust level:
   - "Whitelisted" - In user's trusted list
   - "Self-attested" - Valid address, not trusted
   - "Unknown" - Invalid address format
4. User clicks Accept or Reject
5. If accepted, credential stored in vault
6. Confirmation returned to dApp
```

## Security

### Encryption

- **Key Derivation:** Argon2id (64 MB memory, 3 iterations)
- **Encryption:** AES-256-GCM with random IV per operation
- **Storage:** Encrypted vault in `chrome.storage.local`

### Password Requirements

- Minimum 12 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- At least one special character

### Origin Validation

- Content script validates `event.origin`
- Background uses Chrome's `sender.origin` (not message payload)
- Prevents malicious dApps from spoofing origins

### Error Sanitization

- Internal error details not exposed to dApps
- Generic error messages prevent information leakage

### Fail-Closed Design

- Storage errors lock the vault
- Decryption failures lock the vault
- Missing configuration blocks real proofs

## Development

### Project Structure

```
src/
├── background/
│   ├── index.ts           # Service worker, message handling
│   └── proof-generator.ts # ZK proof orchestration
├── content/
│   ├── injected.ts        # Content script, message forwarding
│   └── page-api.ts        # window.midnightCloak implementation
├── offscreen/
│   └── index.ts           # Argon2id + ZK proofs (WASM context)
├── popup/
│   ├── App.tsx            # Main app, state management
│   ├── main.tsx           # React entry point
│   └── pages/
│       ├── Home.tsx               # Credential list
│       ├── CredentialDetail.tsx   # View credential
│       ├── CredentialOffer.tsx    # Accept/reject offers
│       ├── VerificationRequest.tsx # Approve/deny requests
│       ├── LockScreen.tsx         # Password unlock
│       ├── Onboarding.tsx         # Initial setup
│       └── Settings.tsx           # Configuration
└── shared/
    ├── messaging/types.ts         # Message type definitions
    └── storage/
        ├── encrypted-storage.ts   # Vault encryption
        ├── request-queue.ts       # Persistent request storage
        ├── issuer-trust.ts        # Trusted issuer management
        └── credential-backup.ts   # Export/import
```

### Testing

```bash
# Run tests
npm run test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

### Environment Variables

```bash
# .env.local
VITE_ALLOW_MOCK_PROOFS=true    # Enable mock proofs for development
VITE_CIRCUIT_ASSETS_URL=...     # Override circuit assets location
```

### Mock Proofs

In development mode with `VITE_ALLOW_MOCK_PROOFS=true`, the extension generates mock proofs instead of real ZK proofs. Mock proofs are marked with `isMock: true` in the response.

**Do not use mock proofs in production.** They provide no cryptographic guarantees.

## Manifest Permissions

| Permission | Purpose |
|------------|---------|
| `storage` | Encrypted vault storage |
| `activeTab` | Inject content script |
| `offscreen` | WASM context for Argon2id/proofs |
| `alarms` | Auto-lock timer |

## Browser Support

- Chrome 116+ (Manifest V3, offscreen documents)
- Chromium-based browsers (Edge, Brave, Opera)

Firefox support is not currently available due to Manifest V3 differences.

## Troubleshooting

### Extension not detected

1. Verify extension is loaded in `chrome://extensions`
2. Check extension is enabled
3. Refresh the page
4. Check console for errors

### Verification times out

- Ensure Lace wallet is installed and connected
- Check network connectivity
- Verify proof server is accessible

### Vault won't unlock

- Verify correct password
- If forgotten, use Settings > Reset Vault (credentials will be lost)

### "Unknown issuer" warning

The issuer address is not in your trusted list. You can:
- Review the credential carefully before accepting
- Add the issuer to your trusted list in Settings

## Related Packages

- [@midnight-cloak/core](../core/README.md) - SDK for dApp developers
- [@midnight-cloak/react](../react/README.md) - React components
- [@midnight-cloak/wallet](../wallet/README.md) - Wallet utilities

## License

MIT
