import { useState } from 'react';
import { MaskIDClient } from '@maskid/core';

const client = new MaskIDClient({
  network: 'testnet',
  apiKey: 'demo-key',
});

export function App() {
  const [status, setStatus] = useState<'idle' | 'verifying' | 'verified' | 'denied'>('idle');
  const [error, setError] = useState<string | null>(null);

  const handleVerify = async () => {
    setStatus('verifying');
    setError(null);

    try {
      const result = await client.verify({
        type: 'AGE',
        policy: { minAge: 18 },
      });

      if (result.verified) {
        setStatus('verified');
      } else {
        setStatus('denied');
        setError(result.error?.message || 'Verification failed');
      }
    } catch (e) {
      setStatus('denied');
      setError(e instanceof Error ? e.message : 'Unknown error');
    }
  };

  return (
    <div className="app">
      <header>
        <h1>MaskID Demo</h1>
        <p>Zero-knowledge identity verification for Midnight</p>
      </header>

      <main>
        <div className="card">
          <h2>Age Verification</h2>
          <p>Prove you are 18+ without revealing your birthdate.</p>

          <div className="status">
            <strong>Status:</strong> {status}
            {error && <p className="error">{error}</p>}
          </div>

          {status === 'idle' && (
            <button onClick={handleVerify} className="verify-btn">
              Verify Age (18+)
            </button>
          )}

          {status === 'verifying' && <p className="loading">Waiting for wallet approval...</p>}

          {status === 'verified' && (
            <div className="success">
              <h3>Verified!</h3>
              <p>You have proven you are 18+ without revealing your birthdate.</p>
            </div>
          )}

          {status === 'denied' && (
            <button onClick={handleVerify} className="verify-btn">
              Try Again
            </button>
          )}
        </div>
      </main>

      <footer>
        <p>
          Built with <a href="https://midnight.network">Midnight</a>
        </p>
      </footer>
    </div>
  );
}
