# Midnight Cloak Examples

Practical examples for integrating Midnight Cloak into your dApp.

## Examples

| Example | Description |
|---------|-------------|
| [react-age-gate](./react-age-gate/) | Age verification with React components |
| [error-handling](./error-handling/) | Proper error handling patterns |
| [nextjs-integration](./nextjs-integration/) | Next.js App Router integration |

## Quick Start

### React (Vite, Create React App)

```tsx
import { MidnightCloakProvider, VerifyButton } from '@midnight-cloak/react';

function App() {
  return (
    <MidnightCloakProvider config={{ network: 'preprod' }}>
      <VerifyButton
        type="AGE"
        minAge={18}
        onVerified={() => console.log('Verified!')}
      >
        Verify Age
      </VerifyButton>
    </MidnightCloakProvider>
  );
}
```

### Core SDK (Vanilla JS/TS)

```typescript
import { MidnightCloakClient } from '@midnight-cloak/core';

const client = new MidnightCloakClient({ network: 'preprod' });

const result = await client.verify({
  type: 'AGE',
  policy: { kind: 'age', minAge: 18 },
});

if (result.verified) {
  console.log('User is 18+');
}
```

## Prerequisites

1. **Midnight Cloak Extension** - Install from Chrome Web Store (or load unpacked for development)
2. **Lace Wallet** - Install from [lace.io](https://lace.io)
3. **Testnet Funds** - Get tDUST from the [Midnight faucet](https://faucet.midnight.network)
4. **Age Credential** - Store a test credential in the extension

## Development Mode

Enable mock proofs for development without real ZK proof generation:

```tsx
<MidnightCloakProvider
  config={{
    network: 'preprod',
    allowMockProofs: true,  // Only in development!
  }}
>
```

Mock proofs are marked with `isMock: true` in the response. Never use in production.

## Related Documentation

- [SDK Core](../packages/core/README.md) - Full API reference
- [React Components](../packages/react/README.md) - Component documentation
- [Integration Guide](../docs/INTEGRATION.md) - Step-by-step tutorial
- [Wallet Extension](../packages/wallet-extension/README.md) - Extension architecture

## Need Help?

- Check the [Troubleshooting Guide](../TROUBLESHOOTING.md)
- Review [Error Handling Patterns](./error-handling/)
- Open an issue on GitHub
