import { useState } from 'react';
import {
  MidnightCloakProvider,
  VerifyButton,
  CredentialGate,
  useMidnightCloak,
  type CredentialGateRenderProps,
} from '@midnight-cloak/react';

type WalletStatus = 'disconnected' | 'connecting' | 'connected';

/**
 * WalletConnection component - uses the provider's client via useMidnightCloak hook
 * to ensure wallet state is shared across all components.
 */
function WalletConnection({
  status,
  setStatus,
}: {
  status: WalletStatus;
  setStatus: (status: WalletStatus) => void;
}) {
  const { client } = useMidnightCloak();
  const [error, setError] = useState<string | null>(null);
  const [useMock, setUseMock] = useState(false);

  const handleConnectWallet = async () => {
    setStatus('connecting');
    setError(null);

    try {
      await client.connectWallet('lace');
      setStatus('connected');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to connect wallet');
      setStatus('disconnected');
    }
  };

  const handleUseMockWallet = () => {
    console.log('[MidnightCloak] Setting up mock wallet...');
    client.useMockWallet({ network: 'preprod' });
    console.log('[MidnightCloak] Mock wallet ready');
    setUseMock(true);
    setStatus('connected');
  };

  return (
    <div className="card" style={{ marginBottom: '1.5rem' }}>
      <h2>Wallet Connection</h2>
      <p>Connect your Midnight wallet to get started.</p>

      <div className="status">
        <strong>Status:</strong>{' '}
        {status === 'connected' ? (
          <span style={{ color: 'var(--color-success)' }}>
            Connected {useMock && '(Mock Mode)'}
          </span>
        ) : status === 'connecting' ? (
          'Connecting...'
        ) : (
          'Disconnected'
        )}
      </div>

      {status === 'disconnected' && (
        <div className="wallet-actions">
          {client.isLaceAvailable() && (
            <button onClick={handleConnectWallet} className="verify-btn">
              Connect Lace Wallet
            </button>
          )}
          <button
            onClick={handleUseMockWallet}
            className="verify-btn secondary"
            style={{ marginTop: client.isLaceAvailable() ? '0.5rem' : '0' }}
          >
            Use Demo Mode (No Wallet)
          </button>
        </div>
      )}

      {error && status === 'disconnected' && <p className="error">{error}</p>}
    </div>
  );
}

function AgeVerificationCard() {
  // No need for useMock prop - wallet state is already shared via provider
  const [status, setStatus] = useState<'idle' | 'verified' | 'denied'>('idle');
  const [error, setError] = useState<string | null>(null);

  const handleReset = () => {
    setStatus('idle');
    setError(null);
  };

  return (
    <div className="card" style={{ marginBottom: '1.5rem' }}>
      <h2>Age Verification (VerifyButton)</h2>
      <p>Using the VerifyButton component for one-click verification.</p>

      {status === 'idle' && (
        <VerifyButton
          policy={{ kind: 'age', minAge: 18 }}
          onVerified={(result) => {
            console.log('[MidnightCloak] Verification SUCCESS:', result);
            setStatus('verified');
          }}
          onDenied={() => {
            console.log('[MidnightCloak] Verification DENIED');
            setStatus('denied');
            setError('Verification denied');
          }}
          onVerificationError={(err) => {
            console.log('[MidnightCloak] Verification ERROR:', err);
            setStatus('denied');
            setError(err.message);
          }}
          className="verify-btn"
        >
          Verify Age (18+)
        </VerifyButton>
      )}

      {status === 'verified' && (
        <div className="success">
          <h3>Verified!</h3>
          <p>You've proven you are 18+ without revealing your birthdate.</p>
          <button onClick={handleReset} className="verify-btn secondary" style={{ marginTop: '1rem' }}>
            Verify Again
          </button>
        </div>
      )}

      {status === 'denied' && (
        <div>
          {error && <p className="error">{error}</p>}
          <button onClick={handleReset} className="verify-btn">
            Try Again
          </button>
        </div>
      )}
    </div>
  );
}

function GatedContentCard() {
  // No need for useMock prop - wallet state is already shared via provider
  return (
    <div className="card">
      <h2>Gated Content (CredentialGate)</h2>
      <p>Content below is gated behind age verification.</p>

      <CredentialGate
        policy={{ kind: 'age', minAge: 21 }}
        persistSession={true}
        sessionDuration={300}
        onVerified={(result) => console.log('[MidnightCloak] Gate UNLOCKED:', result)}
        onError={(err) => console.error('[MidnightCloak] Gate ERROR:', err)}
        loading={<p className="loading">Checking verification status...</p>}
        fallback={({ status, error, verify }: CredentialGateRenderProps) => (
          <div className="gate-fallback">
            <p style={{ color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
              You must be 21+ to view this content.
            </p>
            {error && <p className="error">{error.message}</p>}
            <button onClick={verify} className="verify-btn">
              {status === 'error' ? 'Try Again' : 'Verify Age (21+)'}
            </button>
          </div>
        )}
      >
        <div className="success">
          <h3>Welcome to the VIP Area!</h3>
          <p>
            This content is only visible to verified 21+ users. You've successfully
            proven your age without revealing your birthdate.
          </p>
        </div>
      </CredentialGate>
    </div>
  );
}

export function App() {
  const [walletStatus, setWalletStatus] = useState<WalletStatus>('disconnected');

  // Note: useMock state is no longer needed since all components
  // share the same client via the provider. When WalletConnection
  // sets up the mock wallet, it's available to all child components.

  return (
    <MidnightCloakProvider
      apiKey="demo-key"
      network="preprod"
      onError={(err) => console.error('Midnight Cloak Error:', err)}
    >
      <div className="app">
        <header>
          <h1>Midnight Cloak Demo</h1>
          <p>Zero-knowledge identity verification for Midnight</p>
        </header>

        <main>
          <WalletConnection
            status={walletStatus}
            setStatus={setWalletStatus}
          />

          {walletStatus === 'connected' && (
            <>
              <AgeVerificationCard />
              <GatedContentCard />
            </>
          )}

          {walletStatus !== 'connected' && (
            <div className="card">
              <p style={{ color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                Connect your wallet first to see verification demos.
              </p>
            </div>
          )}
        </main>

        <footer>
          <p>
            Built with <a href="https://midnight.network">Midnight</a>
          </p>
        </footer>
      </div>
    </MidnightCloakProvider>
  );
}
