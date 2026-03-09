import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

interface SettingsProps {
  onLock: () => void;
}

export default function Settings({ onLock }: SettingsProps) {
  const navigate = useNavigate();
  const [autoLockMinutes, setAutoLockMinutes] = useState(5);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      const result = await chrome.storage.local.get(['autoLockMinutes']);
      if (result.autoLockMinutes) {
        setAutoLockMinutes(result.autoLockMinutes);
      }
    } catch (err) {
      console.error('Failed to load settings:', err);
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
