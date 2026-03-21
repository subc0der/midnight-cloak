# Integrating Midnight Cloak into Your dApp

> **Beta Preview (March 2026):** This SDK currently uses mock proofs for verification. Real zero-knowledge proofs will be enabled in a future release once Midnight SDK browser patterns stabilize post-mainnet. The verification UX is fully functional - only the cryptographic proof generation is mocked.

Add zero-knowledge age verification to your React dApp. Users prove they meet age requirements without revealing their birthdate.

**Prerequisites:**
- React 18+ application
- Node.js 18+
- [Eternl](https://eternl.io/) or [Lace Midnight](https://www.lace.io/) wallet (Chrome extension)

---

## Step 1: Install Packages

```bash
npm install @midnight-cloak/core @midnight-cloak/react
# or
pnpm add @midnight-cloak/core @midnight-cloak/react
```

---

## Step 2: Set Up the Provider

Wrap your app with `MidnightCloakProvider` to initialize the SDK.

```tsx
// src/main.tsx or src/App.tsx
import { MidnightCloakProvider } from '@midnight-cloak/react';

function App() {
  return (
    <MidnightCloakProvider
      network="preprod"
      onError={(err) => console.error('Midnight Cloak error:', err)}
    >
      <YourApp />
    </MidnightCloakProvider>
  );
}
```

**Configuration options:**

| Prop | Description |
|------|-------------|
| `network` | `'preprod'` for testnet, `'mainnet'` for production |
| `apiKey` | Optional API key for metered billing |
| `autoReconnect` | Remember last connected wallet (default: false) |
| `onError` | Global error handler |

---

## Step 3: Add a Verification Button

The simplest way to add verification is with `VerifyButton`.

```tsx
import { VerifyButton } from '@midnight-cloak/react';

function AgeGatedFeature() {
  const [verified, setVerified] = useState(false);

  if (verified) {
    return <p>Welcome! You have been verified.</p>;
  }

  return (
    <VerifyButton
      policy={{ kind: 'age', minAge: 18 }}
      onVerified={(result) => {
        console.log('Verification successful:', result);
        setVerified(true);
      }}
      onDenied={() => {
        console.log('User did not meet age requirement');
      }}
      onVerificationError={(error) => {
        console.error('Verification error:', error.message);
      }}
    >
      Verify Age (18+)
    </VerifyButton>
  );
}
```

**What happens when clicked:**
1. Extension popup opens with verification request
2. User approves or denies
3. ZK proof is generated (proves age without revealing birthdate)
4. `onVerified` callback fires with the proof

---

## Step 4: Gate Content Behind Verification

Use `CredentialGate` to show content only after verification.

```tsx
import { CredentialGate } from '@midnight-cloak/react';

function VIPSection() {
  return (
    <CredentialGate
      policy={{ kind: 'age', minAge: 21 }}
      persistSession={true}
      sessionDuration={3600}  // 1 hour
      loading={<p>Checking verification status...</p>}
      fallback={({ verify, status, error }) => (
        <div>
          <p>You must be 21+ to view this content.</p>
          {error && <p style={{ color: 'red' }}>{error.message}</p>}
          <button onClick={verify}>
            {status === 'error' ? 'Try Again' : 'Verify Age'}
          </button>
        </div>
      )}
    >
      <div>
        <h2>Welcome to the VIP Area</h2>
        <p>This content is only visible to verified 21+ users.</p>
      </div>
    </CredentialGate>
  );
}
```

**Session persistence:**
- `persistSession={true}` stores verification in sessionStorage
- Users don't need to re-verify on page refresh
- `sessionDuration` controls how long the session lasts

---

## Step 5: Custom Verification Flows

For full control, use the `useVerification` hook.

```tsx
import { useVerification } from '@midnight-cloak/react';

function CustomVerificationUI() {
  const { verify, status, result, error, reset } = useVerification();

  const handleVerify = async () => {
    await verify({
      type: 'AGE',
      policy: { kind: 'age', minAge: 18 }
    });
  };

  return (
    <div>
      {status === 'idle' && (
        <button onClick={handleVerify}>Start Verification</button>
      )}

      {status === 'pending' && (
        <p>Waiting for user approval...</p>
      )}

      {status === 'verified' && (
        <div>
          <p>Verified successfully!</p>
          <button onClick={reset}>Reset</button>
        </div>
      )}

      {status === 'denied' && (
        <div>
          <p>Verification denied</p>
          <button onClick={reset}>Try Again</button>
        </div>
      )}

      {status === 'error' && (
        <div>
          <p>Error: {error?.message}</p>
          <button onClick={reset}>Try Again</button>
        </div>
      )}
    </div>
  );
}
```

---

## Step 6: Handle Wallet Connection

Users need a supported wallet (Eternl or Lace) to verify. Handle installation and connection gracefully.

```tsx
import { useMidnightCloak } from '@midnight-cloak/react';

function WalletConnection() {
  const { client, isConnected, connect, disconnect } = useMidnightCloak();
  const eternlAvailable = client.isEternlAvailable();
  const laceAvailable = client.isLaceAvailable();
  const anyWalletAvailable = eternlAvailable || laceAvailable;

  // Prompt user to install a wallet
  if (!anyWalletAvailable) {
    return (
      <div>
        <p>A supported wallet is required</p>
        <button onClick={() => {
          window.open(client.getWalletInstallUrl('eternl'), '_blank');
          client.pollForWalletInstallation('eternl', {
            onDetected: () => window.location.reload()
          });
        }}>
          Install Eternl
        </button>
        <button onClick={() => {
          window.open(client.getWalletInstallUrl('lace'), '_blank');
          client.pollForWalletInstallation('lace', {
            onDetected: () => window.location.reload()
          });
        }}>
          Install Lace
        </button>
      </div>
    );
  }

  // Connect/disconnect wallet
  if (isConnected) {
    return (
      <div>
        <p>Wallet connected</p>
        <button onClick={disconnect}>Disconnect</button>
      </div>
    );
  }

  return (
    <div>
      {eternlAvailable && (
        <button onClick={() => client.connectWallet('eternl')}>
          Connect Eternl
        </button>
      )}
      {laceAvailable && (
        <button onClick={() => client.connectWallet('lace')}>
          Connect Lace
        </button>
      )}
    </div>
  );
}
```

**Auto-reconnect:**

Enable `autoReconnect` to remember the user's wallet preference.

```tsx
<MidnightCloakProvider
  network="preprod"
  autoReconnect={true}
>
  {/* User's last wallet will reconnect automatically */}
</MidnightCloakProvider>
```

---

## Step 7: Error Handling

Use `getErrorGuidance` for user-friendly error messages.

```tsx
import { getErrorGuidance } from '@midnight-cloak/core';

function ErrorDisplay({ error }) {
  const guidance = getErrorGuidance(error);

  return (
    <div role="alert">
      <h4>{guidance.title}</h4>
      <p>{guidance.description}</p>
      {guidance.actions.map((action, i) => (
        <button key={i} onClick={() => handleAction(action)}>
          {action.label}
        </button>
      ))}
    </div>
  );
}

function handleAction(action) {
  switch (action.type) {
    case 'retry':
      // Retry the verification
      break;
    case 'link':
      window.open(action.url, '_blank');
      break;
    case 'connect-wallet':
      // Prompt wallet connection
      break;
    case 'dismiss':
      // Close the error
      break;
  }
}
```

**Common errors:**

| Error | Meaning | Solution |
|-------|---------|----------|
| WALLET_NOT_CONNECTED | No wallet connected | Prompt user to connect |
| VERIFICATION_DENIED | User rejected request | Show message, allow retry |
| VERIFICATION_TIMEOUT | Request timed out | Retry verification |
| NETWORK_ERROR | Network issue | Check connection, retry |

---

## Testing Your Integration

### Development Setup

1. Install [Eternl](https://eternl.io/) or [Lace Midnight](https://www.lace.io/) wallet Chrome extension
2. Create a wallet and switch to **Preprod** network
3. Get test tokens from the [Midnight faucet](https://faucet.preprod.midnight.network)

### Run the Demo

See a working example in the demo app:

```bash
git clone <repo>
cd midnight-cloak
pnpm install
pnpm dev
```

Open http://localhost:5173 to see verification in action.

---

## Network Configuration

| Network | Use Case | Status |
|---------|----------|--------|
| `preprod` | Development and testing | Available |
| `mainnet` | Production | Awaiting real ZK proof support |

Always use `preprod` during development. Mainnet deployment will be available once Midnight SDK browser support stabilizes.

---

## Security Notes

- **Zero-knowledge proofs** ensure user data (birthdate) is never revealed
- Proofs are generated client-side in the user's wallet extension
- Your dApp receives only the proof result, not personal data
- No data liability for your application

---

## Next Steps

- [Core SDK Reference](../packages/core/README.md) - Full API documentation
- [React Components Reference](../packages/react/README.md) - Component props and hooks
- [Demo App Source](../apps/demo/src/App.tsx) - Working example code

---

## Support

- [GitHub Issues](https://github.com/subc0der/midnight-cloak/issues) - Bug reports and feature requests
- [Midnight Discord](https://discord.gg/midnight) - Community support

---

*Built on [Midnight Network](https://midnight.network)*
