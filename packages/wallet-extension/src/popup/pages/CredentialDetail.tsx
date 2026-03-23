import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { Credential } from '@midnight-cloak/core';

export default function CredentialDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [credential, setCredential] = useState<Credential | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  const loadCredential = useCallback(async () => {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GET_CREDENTIAL',
        id,
      });

      if (response.success) {
        setCredential(response.credential);
      }
    } catch (err) {
      console.error('Failed to load credential:', err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadCredential();
  }, [loadCredential]);

  async function handleDelete() {
    if (!confirm('Are you sure you want to delete this credential?')) {
      return;
    }

    setDeleting(true);

    try {
      await chrome.runtime.sendMessage({
        type: 'DELETE_CREDENTIAL',
        id,
      });

      navigate('/');
    } catch (err) {
      console.error('Failed to delete credential:', err);
      setDeleting(false);
    }
  }

  function formatDate(timestamp: number): string {
    return new Date(timestamp).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  }

  if (loading) {
    return (
      <div className="app">
        <div className="page-center">
          <div className="spinner" />
        </div>
      </div>
    );
  }

  if (!credential) {
    return (
      <div className="app">
        <header className="header">
          <button className="btn-icon" onClick={() => navigate('/')}>
            ←
          </button>
          <h1>Credential</h1>
          <div style={{ width: 32 }} />
        </header>
        <div className="page-center">
          <p>Credential not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="header">
        <button className="btn-icon" onClick={() => navigate('/')}>
          ←
        </button>
        <h1>{credential.type.replace('_', ' ')}</h1>
        <div style={{ width: 32 }} />
      </header>

      <div className="page">
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="settings-item">
            <span style={{ color: 'var(--color-text-muted)' }}>Type</span>
            <span>{credential.type}</span>
          </div>
          <div className="settings-item">
            <span style={{ color: 'var(--color-text-muted)' }}>Issued</span>
            <span>{formatDate(credential.issuedAt)}</span>
          </div>
          {credential.expiresAt && (
            <div className="settings-item">
              <span style={{ color: 'var(--color-text-muted)' }}>Expires</span>
              <span>{formatDate(credential.expiresAt)}</span>
            </div>
          )}
          <div className="settings-item">
            <span style={{ color: 'var(--color-text-muted)' }}>Issuer</span>
            <span style={{ fontFamily: 'monospace', fontSize: 12 }}>
              {credential.issuer.slice(0, 8)}...{credential.issuer.slice(-8)}
            </span>
          </div>
        </div>

        {credential.claims && Object.keys(credential.claims).length > 0 && (
          <div className="card" style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 12 }}>
              CLAIMS
            </h3>
            {Object.entries(credential.claims).map(([key, value]) => (
              <div key={key} className="settings-item">
                <span style={{ color: 'var(--color-text-muted)' }}>{key}</span>
                <span>{String(value)}</span>
              </div>
            ))}
          </div>
        )}

        <button
          className="btn btn-secondary btn-full"
          onClick={handleDelete}
          disabled={deleting}
          style={{ marginTop: 'auto', color: 'var(--color-error)' }}
        >
          {deleting ? 'Deleting...' : 'Delete Credential'}
        </button>
      </div>
    </div>
  );
}
