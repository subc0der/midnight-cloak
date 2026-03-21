import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { TrustedIssuer } from '../../shared/storage/issuer-trust';

interface SettingsProps {
  onLock: () => void;
}

export default function Settings({ onLock }: SettingsProps) {
  const navigate = useNavigate();
  const [autoLockMinutes, setAutoLockMinutes] = useState(5);
  const [saving, setSaving] = useState(false);
  const [trustedIssuers, setTrustedIssuers] = useState<TrustedIssuer[]>([]);
  const [showAddIssuer, setShowAddIssuer] = useState(false);
  const [newIssuerAddress, setNewIssuerAddress] = useState('');
  const [newIssuerName, setNewIssuerName] = useState('');
  const [addError, setAddError] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
    loadTrustedIssuers();
  }, []);

  async function loadSettings() {
    try {
      const result = await chrome.storage.local.get(['autoLockMinutes']);
      if (typeof result.autoLockMinutes === 'number') {
        setAutoLockMinutes(result.autoLockMinutes);
      }
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  }

  async function loadTrustedIssuers() {
    try {
      // Use message to service worker to avoid cross-context race conditions
      const response = await chrome.runtime.sendMessage({ type: 'GET_TRUSTED_ISSUERS' });
      if (response.success) {
        setTrustedIssuers(response.issuers || []);
      } else {
        console.error('Failed to load trusted issuers:', response.error);
      }
    } catch (err) {
      console.error('Failed to load trusted issuers:', err);
    }
  }

  async function handleAddIssuer() {
    setAddError(null);

    if (!newIssuerAddress.trim()) {
      setAddError('Please enter an issuer address');
      return;
    }

    if (!newIssuerName.trim()) {
      setAddError('Please enter a display name');
      return;
    }

    try {
      // Use message to service worker to avoid cross-context race conditions
      const response = await chrome.runtime.sendMessage({
        type: 'ADD_TRUSTED_ISSUER',
        issuer: {
          address: newIssuerAddress.trim(),
          name: newIssuerName.trim(),
        },
      });

      if (response.success) {
        setNewIssuerAddress('');
        setNewIssuerName('');
        setShowAddIssuer(false);
        await loadTrustedIssuers();
      } else {
        setAddError(response.error || 'Failed to add issuer');
      }
    } catch (err) {
      setAddError((err as Error).message);
    }
  }

  async function handleRemoveIssuer(address: string) {
    try {
      // Use message to service worker to avoid cross-context race conditions
      const response = await chrome.runtime.sendMessage({
        type: 'REMOVE_TRUSTED_ISSUER',
        address,
      });

      if (response.success) {
        await loadTrustedIssuers();
      } else {
        console.error('Failed to remove issuer:', response.error);
      }
    } catch (err) {
      console.error('Failed to remove issuer:', err);
    }
  }

  async function handleAutoLockChange(minutes: number) {
    setAutoLockMinutes(minutes);
    setSaving(true);

    try {
      await chrome.storage.local.set({ autoLockMinutes: minutes });
      await chrome.runtime.sendMessage({
        type: 'UPDATE_AUTO_LOCK',
        minutes,
      });
    } catch (err) {
      console.error('Failed to save settings:', err);
    } finally {
      setSaving(false);
    }
  }

  async function handleLock() {
    await chrome.runtime.sendMessage({ type: 'LOCK_VAULT' });
    onLock();
  }

  async function handleReset() {
    if (!confirm('This will delete all credentials and reset the extension. Are you sure?')) {
      return;
    }

    if (!confirm('This action cannot be undone. Continue?')) {
      return;
    }

    try {
      await chrome.storage.local.clear();
      window.location.reload();
    } catch (err) {
      console.error('Failed to reset:', err);
    }
  }

  return (
    <div className="app">
      <header className="header">
        <button className="btn-icon" onClick={() => navigate('/')}>
          ←
        </button>
        <h1>Settings</h1>
        <div style={{ width: 32 }} />
      </header>

      <div className="page">
        <div className="settings-section">
          <h3>Security</h3>

          <div className="settings-item">
            <span>Auto-lock after</span>
            <select
              value={autoLockMinutes}
              onChange={(e) => handleAutoLockChange(Number(e.target.value))}
              disabled={saving}
              style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-sm)',
                padding: '6px 10px',
                color: 'var(--color-text)',
              }}
            >
              <option value={1}>1 minute</option>
              <option value={5}>5 minutes</option>
              <option value={15}>15 minutes</option>
              <option value={30}>30 minutes</option>
              <option value={60}>1 hour</option>
            </select>
          </div>

          <div className="settings-item">
            <span>Lock now</span>
            <button className="btn btn-secondary" onClick={handleLock}>
              🔒 Lock
            </button>
          </div>
        </div>

        <div className="settings-section">
          <h3>Trusted Issuers</h3>

          {trustedIssuers.length > 0 ? (
            <ul className="trusted-issuers-list">
              {trustedIssuers.map((issuer) => (
                <li key={issuer.address} className="trusted-issuer-item">
                  <div className="trusted-issuer-info">
                    <div className="trusted-issuer-name">{issuer.name}</div>
                    <div className="trusted-issuer-address">
                      {issuer.address.slice(0, 12)}...{issuer.address.slice(-12)}
                    </div>
                  </div>
                  <button
                    className="btn btn-remove"
                    onClick={() => handleRemoveIssuer(issuer.address)}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty-state">
              <p>No trusted issuers yet</p>
            </div>
          )}

          {showAddIssuer ? (
            <div style={{ marginTop: 12 }}>
              <input
                type="text"
                placeholder="Issuer address (64 hex characters)"
                value={newIssuerAddress}
                onChange={(e) => setNewIssuerAddress(e.target.value)}
                className="input"
                style={{
                  width: '100%',
                  marginBottom: 8,
                  padding: '8px 12px',
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--color-text)',
                }}
              />
              <input
                type="text"
                placeholder="Display name"
                value={newIssuerName}
                onChange={(e) => setNewIssuerName(e.target.value)}
                className="input"
                style={{
                  width: '100%',
                  marginBottom: 8,
                  padding: '8px 12px',
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--color-text)',
                }}
              />
              {addError && (
                <p style={{ color: 'var(--color-error)', fontSize: 12, marginBottom: 8 }}>
                  {addError}
                </p>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    setShowAddIssuer(false);
                    setNewIssuerAddress('');
                    setNewIssuerName('');
                    setAddError(null);
                  }}
                >
                  Cancel
                </button>
                <button className="btn btn-primary" onClick={handleAddIssuer}>
                  Add
                </button>
              </div>
            </div>
          ) : (
            <button
              className="btn btn-secondary btn-full"
              onClick={() => setShowAddIssuer(true)}
              style={{ marginTop: 12 }}
            >
              + Add Issuer
            </button>
          )}
        </div>

        <div className="settings-section">
          <h3>About</h3>

          <div className="settings-item">
            <span>Version</span>
            <span style={{ color: 'var(--color-text-muted)' }}>0.1.0</span>
          </div>

          <div className="settings-item">
            <span>Network</span>
            <span style={{ color: 'var(--color-text-muted)' }}>Preprod</span>
          </div>
        </div>

        <div className="settings-section">
          <h3>Danger Zone</h3>

          <button
            className="btn btn-secondary btn-full"
            onClick={handleReset}
            style={{ color: 'var(--color-error)' }}
          >
            Reset Extension
          </button>
        </div>
      </div>
    </div>
  );
}
