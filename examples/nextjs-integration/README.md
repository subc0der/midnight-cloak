# Next.js Integration Example

Shows how to integrate Midnight Cloak with Next.js App Router.

## Key Considerations

### 1. Client-Only Rendering

The Midnight Cloak SDK requires browser APIs (`window.midnightCloak`) that aren't available during server-side rendering.

**Solution:** Use `'use client'` directive and dynamic imports:

```tsx
'use client';

import dynamic from 'next/dynamic';

// Dynamic import with SSR disabled
const VerifyButton = dynamic(
  () => import('@midnight-cloak/react').then((mod) => mod.VerifyButton),
  { ssr: false }
);
```

### 2. Hydration Safety

To avoid hydration mismatches, wrap client-only code:

```tsx
function ClientOnly({ children }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;
  return <>{children}</>;
}
```

### 3. Provider Placement

Wrap the provider around client components only:

```tsx
export default function Page() {
  return (
    <ClientOnly>
      <MidnightCloakProvider config={{ network: 'preprod' }}>
        <PageContent />
      </MidnightCloakProvider>
    </ClientOnly>
  );
}
```

## File Structure

```
app/
├── layout.tsx          # Root layout (no SDK imports here)
├── page.tsx            # Home page
└── restricted/
    └── page.tsx        # Age-gated page (use this example)
```

## Installation

```bash
npm install @midnight-cloak/core @midnight-cloak/react
```

## Environment Variables

```bash
# .env.local
NEXT_PUBLIC_MIDNIGHT_NETWORK=preprod
```

Use in code:

```tsx
<MidnightCloakProvider
  config={{
    network: process.env.NEXT_PUBLIC_MIDNIGHT_NETWORK || 'preprod',
    allowMockProofs: process.env.NODE_ENV === 'development',
  }}
>
```

## Common Issues

### "window is not defined"

The SDK is being imported during SSR. Use dynamic imports with `ssr: false`.

### Hydration Mismatch

The server and client render different content. Use the `ClientOnly` wrapper pattern.

### Extension Not Detected

The extension check runs before the component mounts. Use `useEffect` to check after mount:

```tsx
const [extensionAvailable, setExtensionAvailable] = useState(false);

useEffect(() => {
  setExtensionAvailable(window.midnightCloak?.isInstalled ?? false);
}, []);
```

## Pages Router

For Next.js Pages Router (older pattern):

```tsx
// pages/restricted.tsx
import dynamic from 'next/dynamic';

const AgeGate = dynamic(() => import('../components/AgeGate'), {
  ssr: false,
});

export default function RestrictedPage() {
  return <AgeGate />;
}
```

## Related

- [React Age Gate Example](../react-age-gate/README.md)
- [React Components Documentation](../../packages/react/README.md)
