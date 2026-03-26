/**
 * Next.js Integration Example
 *
 * Shows how to integrate Midnight Cloak with Next.js App Router.
 *
 * Key considerations:
 * - Client-only rendering (window.midnightCloak not available on server)
 * - Dynamic imports for SDK components
 * - Proper hydration handling
 */

'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import {
  MidnightCloakProvider,
  useMidnightCloak,
} from '@midnight-cloak/react';

// Dynamic import VerifyButton to avoid SSR issues
// The SDK requires browser APIs not available during server rendering
const VerifyButton = dynamic(
  () => import('@midnight-cloak/react').then((mod) => mod.VerifyButton),
  { ssr: false, loading: () => <button disabled>Loading...</button> }
);

const CredentialGate = dynamic(
  () => import('@midnight-cloak/react').then((mod) => mod.CredentialGate),
  { ssr: false }
);

// Wrapper component that only renders on client
function ClientOnly({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  return <>{children}</>;
}

// Main page component
export default function AgeGatedPage() {
  return (
    <ClientOnly>
      <MidnightCloakProvider
        config={{
          network: 'preprod',
          allowMockProofs: process.env.NODE_ENV === 'development',
        }}
      >
        <PageContent />
      </MidnightCloakProvider>
    </ClientOnly>
  );
}

function PageContent() {
  const [verified, setVerified] = useState(false);
  const { isConnected, error: connectionError } = useMidnightCloak();

  return (
    <main className="container mx-auto p-8">
      <h1 className="text-3xl font-bold mb-8">Age-Restricted Content</h1>

      {/* Connection status */}
      <section className="mb-8 p-4 bg-gray-100 rounded">
        <h2 className="font-semibold mb-2">Wallet Status</h2>
        {isConnected ? (
          <p className="text-green-600">Wallet connected</p>
        ) : (
          <p className="text-yellow-600">Wallet not connected</p>
        )}
        {connectionError && (
          <p className="text-red-600">{connectionError.message}</p>
        )}
      </section>

      {/* Verification section */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Verify Your Age</h2>

        <VerifyButton
          type="AGE"
          minAge={21}
          onVerified={() => setVerified(true)}
          onError={(err) => console.error('Verification failed:', err)}
          className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700"
        >
          Verify I am 21+
        </VerifyButton>

        {verified && (
          <p className="mt-4 text-green-600">
            Age verified! You now have access.
          </p>
        )}
      </section>

      {/* Gated content */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Premium Content</h2>

        <CredentialGate
          require={{ type: 'AGE', minAge: 21 }}
          fallback={
            <div className="p-8 bg-gray-200 rounded text-center">
              <p className="text-lg">This content requires age verification.</p>
              <p className="text-sm text-gray-600 mt-2">
                Click the verify button above to access.
              </p>
            </div>
          }
        >
          <div className="p-8 bg-green-100 rounded">
            <h3 className="text-lg font-semibold">Welcome!</h3>
            <p>You have access to age-restricted content.</p>
          </div>
        </CredentialGate>
      </section>
    </main>
  );
}
