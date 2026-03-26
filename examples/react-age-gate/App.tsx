/**
 * React Age Gate Example
 *
 * A complete example showing how to gate content behind age verification
 * using the Midnight Cloak React SDK.
 *
 * Features demonstrated:
 * - MidnightCloakProvider setup
 * - VerifyButton for explicit verification
 * - CredentialGate for automatic content gating
 * - Handling verification state
 */

import React, { useState } from 'react';
import {
  MidnightCloakProvider,
  VerifyButton,
  CredentialGate,
  useMidnightCloak,
} from '@midnight-cloak/react';

// Main app wrapped with provider
export default function App() {
  return (
    <MidnightCloakProvider
      config={{
        network: 'preprod',
        // Enable mock proofs for development
        // Remove this in production
        allowMockProofs: import.meta.env.DEV,
      }}
    >
      <AgeGatedSite />
    </MidnightCloakProvider>
  );
}

function AgeGatedSite() {
  const [isVerified, setIsVerified] = useState(false);
  const { isConnected, walletAddress } = useMidnightCloak();

  return (
    <div className="container">
      <header>
        <h1>Age-Restricted Content</h1>
        {isConnected && (
          <p className="wallet-info">
            Connected: {walletAddress?.slice(0, 8)}...
          </p>
        )}
      </header>

      <main>
        {/* Option 1: Explicit verification with VerifyButton */}
        <section className="verify-section">
          <h2>Verify Your Age</h2>
          <p>Click below to prove you are 21 or older.</p>

          <VerifyButton
            type="AGE"
            minAge={21}
            onVerified={(result) => {
              console.log('Verification successful:', result);
              setIsVerified(true);
            }}
            onError={(error) => {
              console.error('Verification failed:', error);
              // Show user-friendly message
              alert(`Verification failed: ${error.message}`);
            }}
            className="verify-button"
          >
            Verify Age (21+)
          </VerifyButton>

          {isVerified && (
            <p className="success-message">
              Age verified! You now have access to restricted content.
            </p>
          )}
        </section>

        {/* Option 2: Automatic gating with CredentialGate */}
        <section className="gated-section">
          <h2>Premium Content</h2>

          <CredentialGate
            require={{ type: 'AGE', minAge: 21 }}
            fallback={<LockedContent />}
          >
            <UnlockedContent />
          </CredentialGate>
        </section>

        {/* Option 3: CredentialGate with render props for custom UI */}
        <section className="custom-section">
          <h2>Custom Verification UI</h2>

          <CredentialGate require={{ type: 'AGE', minAge: 18 }}>
            {({ verified, verifying, verify, error }) => (
              <div className="custom-gate">
                {verifying ? (
                  <div className="loading">Verifying your age...</div>
                ) : verified ? (
                  <div className="unlocked">
                    <h3>Welcome!</h3>
                    <p>You have access to 18+ content.</p>
                  </div>
                ) : (
                  <div className="locked">
                    <p>This content requires age verification.</p>
                    <button onClick={verify} className="verify-button">
                      Verify Now
                    </button>
                    {error && <p className="error">{error.message}</p>}
                  </div>
                )}
              </div>
            )}
          </CredentialGate>
        </section>
      </main>
    </div>
  );
}

function LockedContent() {
  return (
    <div className="locked-content">
      <div className="lock-icon">🔒</div>
      <p>This content is restricted to users 21 and older.</p>
      <p>Please verify your age to continue.</p>
    </div>
  );
}

function UnlockedContent() {
  return (
    <div className="unlocked-content">
      <div className="unlock-icon">🔓</div>
      <h3>Welcome to Premium Content</h3>
      <p>You have verified you are 21 or older.</p>
      <p>Enjoy unrestricted access to all content.</p>
    </div>
  );
}

// Example: Token-gated content section
function TokenGatedSection() {
  const [hasAccess, setHasAccess] = useState(false);

  return (
    <section className="token-section">
      <h2>Token Holder Benefits</h2>
      <p>Exclusive content for NIGHT token holders.</p>

      <VerifyButton
        type="TOKEN_BALANCE"
        token="NIGHT"
        minBalance={100}
        onVerified={() => setHasAccess(true)}
        onError={(error) => console.error('Token verification failed:', error)}
      >
        Verify 100+ NIGHT
      </VerifyButton>

      {hasAccess && (
        <div className="token-content">
          <h3>Welcome, Token Holder!</h3>
          <p>You have access to exclusive NIGHT holder content.</p>
        </div>
      )}
    </section>
  );
}
