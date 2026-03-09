import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Credential } from '@midnight-cloak/core';

interface HomeProps {
  onLock: () => void;
}

const CREDENTIAL_ICONS: Record<string, string> = {
  AGE: '🎂',
  TOKEN_BALANCE: '💰',
  NFT_OWNERSHIP: '🖼️',
  RESIDENCY: '🏠',
  ACCREDITED: '✅',
  CUSTOM: '📋',
};

export default function Home({ onLock }: HomeProps) {
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    loadCredentials();
  }, []);

  async function loadCredentials() {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GET_CREDENTIALS',
      });

      if (response.success) {
        setCredentials(response.credentials || []);
      }
    } catch (err) {
      console.error('Failed to load credentials:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleLock() {
    await chrome.runtime.sendMessage({ type: 'LOCK_VAULT' });
    onLock();
  }

  function formatDate(timestamp: number): string {
    return new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  return (
    <div className="app">
      <header className="header">
        <h1>Midnight Cloak</h1>
        <div className="header-actions">
          <button className="btn-icon" onClick={() => navigate('/settings')} title="Settings">
            ⚙️
          </button>
          <button className="btn-icon" onClick={handleLock} title="Lock">
            🔒
          </button>
        </div>
      </header>

      <div className="page scroll-content">
        {loading ? (
          <div className="empty-state">
            <div className="spinner" />
          </div>
        ) : credentials.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📭</div>
            <h3>No Credentials Yet</h3>
            <p>
              Your verified credentials will appear here.
              <br />
              Visit a dApp to get started.
            </p>
          </div>
        ) : (
          <div className="credential-list">
            {credentials.map((cred) => (
              <div
                key={cred.id}
                className="credential-card"
                onClick={() => navigate(`/credential/${cred.id}`)}
              >
                <div className="credential-icon">
                  {CREDENTIAL_ICONS[cred.type] || '📋'}
                </div>
                <div className="credential-info">
                  <h3>{cred.type.replace('_', ' ')}</h3>
                  <p>Issued {formatDate(cred.issuedAt)}</p>
                </div>
                <span style={{ color: 'var(--color-text-muted)' }}>→</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
