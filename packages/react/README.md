# @midnight-cloak/react

React components for zero-knowledge identity verification on [Midnight](https://midnight.network).

## Installation

```bash
npm install @midnight-cloak/react @midnight-cloak/core
# or
pnpm add @midnight-cloak/react @midnight-cloak/core
```

**Peer Dependencies:** React 18+

## Quick Start

```tsx
import { MidnightCloakProvider, VerifyButton, CredentialGate } from '@midnight-cloak/react';

function App() {
  return (
    <MidnightCloakProvider network="preprod">
      <VerifyButton
        policy={{ kind: 'age', minAge: 18 }}
        onVerified={() => console.log('Verified!')}
      >
        Verify Age
      </VerifyButton>
    </MidnightCloakProvider>
  );
}
```

## Components

### MidnightCloakProvider

Context provider that initializes the SDK client. Wrap your app with this component.

```tsx
import { MidnightCloakProvider } from '@midnight-cloak/react';

function App() {
  return (
    <MidnightCloakProvider
      network="preprod"
      apiKey="optional-api-key"
      onError={(err) => console.error('SDK Error:', err)}
    >
      {children}
    </MidnightCloakProvider>
  );
}
```

#### Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `network` | `'preprod' \| 'mainnet'` | Yes | Target network |
| `apiKey` | `string` | No | API key for metered billing |
| `autoReconnect` | `boolean` | No | Remember last wallet (default: false) |
| `onError` | `(error: Error) => void` | No | Global error handler |
| `children` | `ReactNode` | Yes | Child components |

### VerifyButton

Pre-built button for one-click verification.

```tsx
import { VerifyButton } from '@midnight-cloak/react';

<VerifyButton
  policy={{ kind: 'age', minAge: 18 }}
  onVerified={(result) => {
    console.log('Verified!', result.proof);
  }}
  onDenied={() => {
    console.log('User did not meet requirements');
  }}
  onVerificationError={(error) => {
    console.error('Error:', error.message);
  }}
  className="my-button"
>
  Verify Age (18+)
</VerifyButton>
```

#### Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `policy` | `PolicyConfig` | Yes* | Verification policy |
| `verificationType` | `VerificationType` | No | Type when using convenience props |
| `minAge` | `number` | No | Convenience prop for age verification |
| `onVerified` | `(result) => void` | No | Called on successful verification |
| `onDenied` | `() => void` | No | Called when verification fails |
| `onVerificationError` | `(error) => void` | No | Called on technical error |
| `children` | `ReactNode` | No | Button content (default: "Verify") |
| `...buttonProps` | `ButtonHTMLAttributes` | No | Standard button props |

*Either `policy` or `verificationType` with convenience props required.

#### Usage Patterns

```tsx
// Recommended: Using policy prop
<VerifyButton policy={{ kind: 'age', minAge: 21 }}>
  Verify 21+
</VerifyButton>

// Alternative: Using convenience props
<VerifyButton verificationType="AGE" minAge={21}>
  Verify 21+
</VerifyButton>
```

### CredentialGate

Gate content behind verification. Only renders children when verified.

```tsx
import { CredentialGate } from '@midnight-cloak/react';

<CredentialGate
  policy={{ kind: 'age', minAge: 21 }}
  persistSession={true}
  sessionDuration={3600}
>
  <RestrictedContent />
</CredentialGate>
```

#### Props

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `policy` | `PolicyConfig` | Yes* | - | Verification policy |
| `require` | `VerificationRequirement` | No | - | Alternative to policy |
| `children` | `ReactNode` | Yes | - | Content shown when verified |
| `fallback` | `ReactNode \| RenderProp` | No | Default UI | Content when unverified |
| `loading` | `ReactNode` | No | "Loading..." | Content while checking |
| `persistSession` | `boolean` | No | `true` | Store verification in sessionStorage |
| `sessionDuration` | `number` | No | `3600` | Session duration in seconds |
| `onVerified` | `(result) => void` | No | - | Called on verification |
| `onError` | `(error) => void` | No | - | Called on error |

#### Render Prop Fallback

For custom unverified UI, use a render prop:

```tsx
<CredentialGate
  policy={{ kind: 'age', minAge: 21 }}
  fallback={({ status, error, verify, reset, isLoading }) => (
    <div>
      <p>You must be 21+ to view this content.</p>
      {error && <p className="error">{error.message}</p>}
      <button onClick={verify} disabled={isLoading}>
        {status === 'error' ? 'Try Again' : 'Verify Age'}
      </button>
    </div>
  )}
>
  <VIPContent />
</CredentialGate>
```

#### Render Prop Properties

| Property | Type | Description |
|----------|------|-------------|
| `status` | `'loading' \| 'verified' \| 'unverified' \| 'error'` | Current gate status |
| `error` | `Error \| null` | Error if verification failed |
| `verify` | `() => Promise<void>` | Trigger verification |
| `reset` | `() => void` | Reset to unverified state |
| `isLoading` | `boolean` | Whether verification is in progress |

## Hooks

### useMidnightCloak

Access the SDK client and wallet state from any component within the provider.

```tsx
import { useMidnightCloak } from '@midnight-cloak/react';

function WalletButton() {
  const { client, isConnected, connect, disconnect } = useMidnightCloak();

  if (isConnected) {
    return <button onClick={disconnect}>Disconnect</button>;
  }

  return <button onClick={connect}>Connect Wallet</button>;
}
```

#### Return Values

| Property | Type | Description |
|----------|------|-------------|
| `client` | `MidnightCloakClient` | SDK client instance |
| `isConnected` | `boolean` | Wallet connection state |
| `connect` | `() => Promise<void>` | Connect to preferred wallet |
| `disconnect` | `() => void` | Disconnect wallet |

### useVerification

Hook for custom verification flows.

```tsx
import { useVerification } from '@midnight-cloak/react';

function CustomVerification() {
  const { verify, status, result, error, reset } = useVerification();

  const handleVerify = async () => {
    await verify({
      type: 'AGE',
      policy: { kind: 'age', minAge: 18 }
    });
  };

  return (
    <div>
      <button onClick={handleVerify} disabled={status === 'pending'}>
        {status === 'pending' ? 'Verifying...' : 'Verify'}
      </button>
      {status === 'success' && <p>Verified!</p>}
      {status === 'error' && <p>Error: {error?.message}</p>}
    </div>
  );
}
```

## Accessibility

All components include ARIA attributes for screen reader support:

- `aria-busy` on buttons during loading
- `aria-live` regions for status updates
- `role="alert"` for error messages
- Focus management on state changes

## Styling

Components accept standard `className` and `style` props. No default styles are included—bring your own CSS.

```tsx
<VerifyButton
  policy={{ kind: 'age', minAge: 18 }}
  className="btn btn-primary"
  style={{ marginTop: '1rem' }}
>
  Verify
</VerifyButton>
```

## TypeScript

Full TypeScript support with exported types:

```typescript
import type {
  VerifyButtonProps,
  CredentialGateProps,
  CredentialGateRenderProps,
  GateStatus,
} from '@midnight-cloak/react';
```

## Related

- [@midnight-cloak/core](../core) - Core SDK documentation
- [Integration Guide](../../docs/INTEGRATION.md) - Step-by-step tutorial

## License

MIT
