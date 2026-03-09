import { useState, useEffect, useCallback } from 'react';
import {
  MidnightCloakProvider,
  VerifyButton,
  CredentialGate,
  useMidnightCloak,
  type CredentialGateRenderProps,
} from '@midnight-cloak/react';
import { getErrorGuidance, type ErrorGuidance, type ErrorAction } from '@midnight-cloak/core';

type WalletStatus = 'disconnected' | 'connecting' | 'connected';

/**
 * ErrorDisplay - Shows actionable error messages with guidance
 */
function ErrorDisplay({
  error,
  onRetry,
  onDismiss,
}: {
  error: Error | unknown;
  onRetry?: () => void;
  onDismiss?: () => void;
}) {
  const guidance: ErrorGuidance = getErrorGuidance(error);

  const handleAction = (action: ErrorAction) => {
    switch (action.type) {
      case 'link':
        if (action.url) {
          window.open(action.url, '_blank');
        }
        break;
      case 'retry':
        onRetry?.();
        break;
      case 'dismiss':
        onDismiss?.();
        break;
      case 'connect-wallet':
        // This would be handled by parent component
        onDismiss?.();
        break;
    }
  };

  return (
    <div className="error-display" role="alert">
      <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--color-error, #dc3545)' }}>
        {guidance.title}
      </h4>
      <p style={{ margin: '0 0 0.75rem 0' }}>{guidance.description}</p>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {guidance.actions.map((action, index) => (
          <button
            key={index}
            onClick={() => handleAction(action)}
            className={`verify-btn ${action.type === 'retry' ? '' : 'secondary'}`}
            style={{ fontSize: '0.875rem', padding: '0.375rem 0.75rem' }}
          >
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * NetworkWarningBanner - Shows when wallet is on wrong network
 */
function NetworkWarningBanner({
  expected,
  actual,
}: {
  expected: string;
  actual: string;
}) {
  return (
    <div
      className="card network-warning"
      role="alert"
      style={{
        backgroundColor: '#f8d7da',
        border: '1px solid #f5c6cb',
        marginBottom: '1.5rem',
      }}
    >
      <h3 style={{ marginTop: 0, color: '#721c24' }}>
        Network Mismatch
      </h3>
      <p style={{ color: '#721c24' }}>
        Your wallet is connected to <strong>{actual}</strong>, but this app expects{' '}
        <strong>{expected}</strong>.
      </p>
      <p style={{ marginBottom: 0, color: '#721c24' }}>
        Please switch networks in your Lace wallet settings.
      </p>
    </div>
  );
}

/**
 * InstallWalletBanner - Shows when Lace wallet is not installed
 */
function InstallWalletBanner({ onInstalled }: { onInstalled: () => void }) {
  const { client } = useMidnightCloak();
  const [isPolling, setIsPolling] = useState(false);

  const handleInstallClick = useCallback(() => {
    const url = client.getWalletInstallUrl('lace');
    window.open(url, '_blank');

    // Start polling for installation
    setIsPolling(true);
    client.pollForWalletInstallation('lace', {
      maxDuration: 120000, // 2 minutes
      onDetected: () => {
        setIsPolling(false);
        onInstalled();
      },
    });
  }, [client, onInstalled]);

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      client.stopInstallPolling();
    };
  }, [client]);

  return (
    <div className="card install-banner" style={{
      backgroundColor: '#fff3cd',
      border: '1px solid #ffc107',
      marginBottom: '1.5rem'
    }}>
      <h3 style={{ marginTop: 0, color: '#856404' }}>Lace Wallet Required</h3>
      <p style={{ color: '#856404' }}>
        To use Midnight Cloak with real credentials, you need the Lace wallet extension.
      </p>
      <button
        onClick={handleInstallClick}
        className="verify-btn"
        disabled={isPolling}
      >
        {isPolling ? 'Checking for Lace...' : 'Install Lace Wallet'}
      </button>
      {isPolling && (
        <div style={{ marginTop: '0.75rem', color: '#856404' }}>
          <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.875rem' }}>
            After installing Lace, click below to continue.
          </p>
          <button
            onClick={() => {
              // Force re-check - if detected, proceed; otherwise refresh
              if (client.isLaceAvailable()) {
                setIsPolling(false);
                onInstalled();
              } else {
                // Extension may need page refresh to inject into this tab
                window.location.reload();
              }
            }}
            className="verify-btn secondary"
            style={{ fontSize: '0.875rem', padding: '0.375rem 0.75rem' }}
          >
            I've installed Lace
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * WalletConnection component - uses the provider's client via useMidnightCloak hook
 * to ensure wallet state is shared across all components.
 */
interface NetworkMismatch {
  expected: string;
  actual: string;
}

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
  const [laceAvailable, setLaceAvailable] = useState(() => client.isLaceAvailable());
  const [networkMismatch, setNetworkMismatch] = useState<NetworkMismatch | null>(null);

  // Listen for wallet becoming available (after installation)
  useEffect(() => {
    const handleWalletAvailable = () => {
      setLaceAvailable(true);
    };
    client.on('wallet:available', handleWalletAvailable);
    return () => {
      client.off('wallet:available', handleWalletAvailable);
    };
  }, [client]);

  // Listen for network mismatch/match events
  useEffect(() => {
    const handleNetworkMismatch = (info: NetworkMismatch) => {
      setNetworkMismatch(info);
    };
    const handleNetworkMatched = () => {
      setNetworkMismatch(null);
    };
    client.on('network:mismatch', handleNetworkMismatch);
    client.on('network:matched', handleNetworkMatched);
    return () => {
      client.off('network:mismatch', handleNetworkMismatch);
      client.off('network:matched', handleNetworkMatched);
    };
  }, [client]);

  // Attempt auto-reconnect on mount
  useEffect(() => {
    const attemptAutoReconnect = async () => {
      if (status !== 'disconnected') return;

      const lastWallet = client.getLastConnectedWallet();
      if (!lastWallet) return;

      setStatus('connecting');
      const wallet = await client.tryAutoReconnect();
      if (wallet) {
        setStatus('connected');
      } else {
        setStatus('disconnected');
      }
    };

    attemptAutoReconnect();
    // Only run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const handleDisconnect = () => {
    // Clear wallet preference when user explicitly disconnects
    client.disconnectWallet(true);
    client.disconnect();
    setUseMock(false);
    setStatus('disconnected');
    setError(null);
    setNetworkMismatch(null);
  };

  const isConnecting = status === 'connecting';

  return (
    <>
      {/* Show install banner when Lace is not available */}
      {!laceAvailable && status === 'disconnected' && (
        <InstallWalletBanner onInstalled={() => setLaceAvailable(true)} />
      )}

      {/* Show network warning when connected to wrong network */}
      {networkMismatch && status === 'connected' && (
        <NetworkWarningBanner
          expected={networkMismatch.expected}
          actual={networkMismatch.actual}
        />
      )}

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h2>Wallet Connection</h2>
        <p>Connect your Midnight wallet to get started.</p>

        <div className="status" aria-live="polite">
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
            {laceAvailable && (
              <button
                onClick={handleConnectWallet}
                className="verify-btn"
                disabled={isConnecting}
                aria-busy={isConnecting}
              >
                {isConnecting ? 'Connecting...' : 'Connect Lace Wallet'}
              </button>
            )}
            <button
              onClick={handleUseMockWallet}
              className="verify-btn secondary"
              style={{ marginTop: laceAvailable ? '0.5rem' : '0' }}
              disabled={isConnecting}
            >
              Use Demo Mode (No Wallet)
            </button>
          </div>
        )}

        {status === 'connecting' && (
          <div className="wallet-actions">
            <p className="loading">Connecting to wallet...</p>
          </div>
        )}

        {status === 'connected' && (
          <button onClick={handleDisconnect} className="verify-btn secondary">
            Disconnect
          </button>
        )}

        {error && status === 'disconnected' && <p className="error" role="alert">{error}</p>}
      </div>
    </>
  );
}

function AgeVerificationCard() {
  // No need for useMock prop - wallet state is already shared via provider
  const [status, setStatus] = useState<'idle' | 'verified' | 'denied' | 'error'>('idle');
  const [lastError, setLastError] = useState<Error | null>(null);

  const handleReset = () => {
    setStatus('idle');
    setLastError(null);
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
            setLastError(new Error('Age requirement not met'));
          }}
          onVerificationError={(err) => {
            console.log('[MidnightCloak] Verification ERROR:', err);
            setStatus('error');
            setLastError(err);
          }}
          className="verify-btn"
        >
          Verify Age (18+)
        </VerifyButton>
      )}

      {status === 'verified' && (
        <div className="success" aria-live="polite">
          <h3>Verified!</h3>
          <p>You've proven you are 18+ without revealing your birthdate.</p>
          <button onClick={handleReset} className="verify-btn secondary" style={{ marginTop: '1rem' }}>
            Verify Again
          </button>
        </div>
      )}

      {status === 'denied' && lastError && (
        <div aria-live="polite">
          <ErrorDisplay
            error={lastError}
            onRetry={handleReset}
            onDismiss={handleReset}
          />
        </div>
      )}

      {status === 'error' && lastError && (
        <div aria-live="assertive">
          <ErrorDisplay
            error={lastError}
            onRetry={handleReset}
            onDismiss={handleReset}
          />
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

// Configuration from environment (with fallbacks for local development)
const config = {
  apiKey: import.meta.env.VITE_MIDNIGHT_CLOAK_API_KEY || 'demo-key',
  network: (import.meta.env.VITE_MIDNIGHT_NETWORK || 'preprod') as 'preprod' | 'mainnet',
  // Enable mock proofs for development when proof server is unavailable
  allowMockProofs: import.meta.env.VITE_ALLOW_MOCK_PROOFS !== 'false',
  // Enable auto-reconnect to remember wallet preference
  autoReconnect: true,
};

export function App() {
  const [walletStatus, setWalletStatus] = useState<WalletStatus>('disconnected');

  // Note: useMock state is no longer needed since all components
  // share the same client via the provider. When WalletConnection
  // sets up the mock wallet, it's available to all child components.

  return (
    <MidnightCloakProvider
      apiKey={config.apiKey}
      network={config.network}
      allowMockProofs={config.allowMockProofs}
      autoReconnect={config.autoReconnect}
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
