import { useState, useEffect } from 'react';
import {
  MaskIDProvider,
  VerifyButton,
  CredentialGate,
  useMaskID,
  type CredentialGateRenderProps,
} from '@maskid/react';
import { MaskIDClient } from '@maskid/core';

// Shared client instance for wallet operations outside provider
const sharedClient = new MaskIDClient({
  network: 'testnet',
  apiKey: 'demo-key',
});

type WalletStatus = 'disconnected' | 'connecting' | 'connected';

function WalletConnection({
  onConnected,
  status,
  setStatus,
}: {
  onConnected: (useMock: boolean) => void;
  status: WalletStatus;
  setStatus: (status: WalletStatus) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [useMock, setUseMock] = useState(false);

  const handleConnectWallet = async () => {
    setStatus('connecting');
    setError(null);

    try {
      await sharedClient.connectWallet('lace');
      setStatus('connected');
      onConnected(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to connect wallet');
      setStatus('disconnected');
    }
  };

  const handleUseMockWallet = () => {
    sharedClient.useMockWallet({ network: 'testnet' });
    setUseMock(true);
    setStatus('connected');
    onConnected(true);
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
          {sharedClient.isLaceAvailable() && (
            <button onClick={handleConnectWallet} className="verify-btn">
              Connect Lace Wallet
            </button>
          )}
          <button
            onClick={handleUseMockWallet}
            className="verify-btn secondary"
            style={{ marginTop: sharedClient.isLaceAvailable() ? '0.5rem' : '0' }}
          >
            Use Demo Mode (No Wallet)
          </button>
        </div>
      )}

      {error && status === 'disconnected' && <p className="error">{error}</p>}
    </div>
  );
}

function AgeVerificationCard({ useMock }: { useMock: boolean }) {
  const client = useMaskID();
  const [status, setStatus] = useState<'idle' | 'verified' | 'denied'>('idle');
  const [error, setError] = useState<string | null>(null);

  // Sync mock wallet to provider's client - only run when useMock changes
  useEffect(() => {
    if (useMock) {
      client.useMockWallet({ network: 'testnet' });
    }
  }, [useMock, client]);

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
          type="AGE"
          minAge={18}
          onVerified={() => setStatus('verified')}
          onDenied={() => {
            setStatus('denied');
            setError('Verification denied');
          }}
          onVerificationError={(err) => {
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

function GatedContentCard({ useMock }: { useMock: boolean }) {
  const client = useMaskID();

  // Sync mock wallet to provider's client - only run when useMock changes
  useEffect(() => {
    if (useMock) {
      client.useMockWallet({ network: 'testnet' });
    }
  }, [useMock, client]);

  return (
    <div className="card">
      <h2>Gated Content (CredentialGate)</h2>
      <p>Content below is gated behind age verification.</p>

      <CredentialGate
        require={{ type: 'AGE', minAge: 21 }}
        persistSession={true}
        sessionDuration={300}
        onVerified={(result) => console.log('Gate unlocked!', result)}
        onError={(err) => console.error('Gate error:', err)}
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
  const [useMock, setUseMock] = useState(false);

  const handleConnected = (isMock: boolean) => {
    setUseMock(isMock);
  };

  return (
    <MaskIDProvider
      apiKey="demo-key"
      network="testnet"
      onError={(err) => console.error('MaskID Error:', err)}
    >
      <div className="app">
        <header>
          <h1>MaskID Demo</h1>
          <p>Zero-knowledge identity verification for Midnight</p>
        </header>

        <main>
          <WalletConnection
            onConnected={handleConnected}
            status={walletStatus}
            setStatus={setWalletStatus}
          />

          {walletStatus === 'connected' && (
            <>
              <AgeVerificationCard useMock={useMock} />
              <GatedContentCard useMock={useMock} />
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
    </MaskIDProvider>
  );
}
