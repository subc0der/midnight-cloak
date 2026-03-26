# React Age Gate Example

A complete example showing how to gate content behind age verification using the Midnight Cloak React SDK.

## What This Demonstrates

1. **MidnightCloakProvider** - Wrapping your app with the provider
2. **VerifyButton** - Explicit "click to verify" pattern
3. **CredentialGate** - Automatic content gating
4. **Render Props** - Custom verification UI with full control

## Quick Start

```bash
# Install dependencies
npm install @midnight-cloak/core @midnight-cloak/react

# Copy this example into your React project
cp App.tsx src/App.tsx
```

## Key Patterns

### Pattern 1: Explicit Verification

Use `VerifyButton` when you want the user to explicitly click to verify:

```tsx
<VerifyButton
  type="AGE"
  minAge={21}
  onVerified={(result) => setIsVerified(true)}
  onError={(error) => showError(error.message)}
>
  Verify Age
</VerifyButton>
```

### Pattern 2: Automatic Gating

Use `CredentialGate` to show different content based on verification:

```tsx
<CredentialGate
  require={{ type: 'AGE', minAge: 21 }}
  fallback={<LockedMessage />}
>
  <UnlockedContent />
</CredentialGate>
```

### Pattern 3: Custom UI with Render Props

For full control over the verification UI:

```tsx
<CredentialGate require={{ type: 'AGE', minAge: 18 }}>
  {({ verified, verifying, verify, error }) => (
    // Your custom UI here
  )}
</CredentialGate>
```

## Development Mode

Set `allowMockProofs: true` in development to test without real ZK proofs:

```tsx
<MidnightCloakProvider
  config={{
    network: 'preprod',
    allowMockProofs: import.meta.env.DEV,
  }}
>
```

Remove `allowMockProofs` in production - mock proofs provide no cryptographic guarantees.

## Prerequisites

- Midnight Cloak browser extension installed
- Lace wallet with testnet tDUST (for real proofs)
- Age credential stored in extension

## Related

- [SDK Core Documentation](../../packages/core/README.md)
- [React Components Documentation](../../packages/react/README.md)
- [Integration Guide](../../docs/INTEGRATION.md)
