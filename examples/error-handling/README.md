# Error Handling Example

Demonstrates proper error handling patterns when using the Midnight Cloak SDK.

## What This Demonstrates

1. **Error Code Checking** - Responding to specific error types
2. **getErrorGuidance()** - User-friendly error messages
3. **Retry Patterns** - Automatic retry with exponential backoff
4. **Graceful Degradation** - Fallback behavior when features unavailable

## Key Error Codes

| Code | Meaning | Suggested Action |
|------|---------|------------------|
| `WALLET_NOT_FOUND` | Extension/wallet not installed | Show install link |
| `WALLET_NOT_CONNECTED` | Wallet installed but not connected | Prompt to connect |
| `NETWORK_MISMATCH` | Wrong network selected | Show network switch instructions |
| `VERIFICATION_REJECTED` | User declined request | Explain why verification is needed |
| `NO_MATCHING_CREDENTIAL` | No valid credential | Explain how to get credential |
| `PROOF_GENERATION_FAILED` | Technical proof error | Retry or contact support |
| `VERIFICATION_TIMEOUT` | Request timed out | Retry |

## Patterns

### Basic Error Handling

```typescript
import { getErrorGuidance } from '@midnight-cloak/core';

try {
  const result = await client.verify({ type: 'AGE', minAge: 18 });
  if (!result.verified) {
    const message = getErrorGuidance(result.error.code);
    showError(message);
  }
} catch (error) {
  showError(getErrorGuidance(error.code));
}
```

### Retry with Backoff

```typescript
async function verifyWithRetry(client, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await client.verify({ type: 'AGE', minAge: 18 });
    } catch (error) {
      // Don't retry user rejections
      if (error.code === ErrorCode.VERIFICATION_REJECTED) throw error;

      // Exponential backoff
      if (attempt < maxRetries) {
        await sleep(1000 * Math.pow(2, attempt - 1));
      }
    }
  }
  throw new Error('Max retries exceeded');
}
```

### Graceful Degradation

```typescript
// Check extension first
if (!window.midnightCloak?.isInstalled) {
  showLimitedContent();
  return;
}

// Check wallet
if (!(await client.isWalletAvailable())) {
  showInstallWalletBanner();
  return;
}

// Proceed with verification
const result = await client.verify({ ... });
```

## Error Categories

### Recoverable (Can Retry)

- `NETWORK_ERROR` - Temporary connectivity
- `PROOF_SERVER_UNAVAILABLE` - Server down
- `VERIFICATION_TIMEOUT` - Request timed out

### Non-Recoverable (Show Message)

- `WALLET_NOT_FOUND` - Need to install
- `VERIFICATION_REJECTED` - User said no
- `NO_MATCHING_CREDENTIAL` - Need credential first
- `NETWORK_MISMATCH` - Wrong network

## React Integration

```tsx
function VerifyAge() {
  const [error, setError] = useState<string | null>(null);

  const handleVerify = async () => {
    try {
      await client.verify({ type: 'AGE', minAge: 18 });
    } catch (err) {
      setError(getErrorGuidance(err.code));
    }
  };

  return (
    <>
      <button onClick={handleVerify}>Verify Age</button>
      {error && <p className="error" role="alert">{error}</p>}
    </>
  );
}
```

## Related

- [SDK Error Codes](../../packages/core/README.md#error-codes)
- [Integration Guide](../../docs/INTEGRATION.md)
