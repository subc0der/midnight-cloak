import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { TrustedIssuer } from '../../shared/storage/issuer-trust';
import type { BackupFile } from '../../shared/storage/credential-backup';

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

  // Backup & Recovery state
  const [showExportModal, setShowExportModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [backupPassword, setBackupPassword] = useState('');
  const [backupConfirmPassword, setBackupConfirmPassword] = useState('');
  const [backupError, setBackupError] = useState<string | null>(null);
  const [backupSuccess, setBackupSuccess] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [pendingBackup, setPendingBackup] = useState<BackupFile | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // ─────────────────────────────────────────────────────────────────────────
  // Backup & Recovery Handlers
  // ─────────────────────────────────────────────────────────────────────────

  const resetBackupState = useCallback(() => {
    setBackupPassword('');
    setBackupConfirmPassword('');
    setBackupError(null);
    setBackupSuccess(null);
    setPendingBackup(null);
  }, []);

  async function handleExport() {
    setBackupError(null);

    if (backupPassword.length < 8) {
      setBackupError('Password must be at least 8 characters');
      return;
    }

    if (backupPassword !== backupConfirmPassword) {
      setBackupError('Passwords do not match');
      return;
    }

    setIsProcessing(true);

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'EXPORT_CREDENTIALS',
        password: backupPassword,
      });

      if (!response.success) {
        setBackupError(response.error || 'Export failed');
        return;
      }

      // Download the backup file
      const backup = response.backup as BackupFile;
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `midnight-cloak-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setBackupSuccess(`Exported ${backup.credentialCount} credential(s)`);
      setBackupPassword('');
      setBackupConfirmPassword('');

      // Close modal after brief delay
      setTimeout(() => {
        setShowExportModal(false);
        resetBackupState();
      }, 2000);
    } catch (err) {
      setBackupError((err as Error).message);
    } finally {
      setIsProcessing(false);
    }
  }

  function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const backup = JSON.parse(e.target?.result as string) as BackupFile;

        // Basic validation
        if (backup.version !== 1 || !backup.encrypted || !backup.salt) {
          setBackupError('Invalid backup file format');
          return;
        }

        setPendingBackup(backup);
        setBackupError(null);
      } catch {
        setBackupError('Failed to read backup file');
      }
    };
    reader.readAsText(file);

    // Reset input so same file can be selected again
    event.target.value = '';
  }

  async function handleImport() {
    setBackupError(null);

    if (!pendingBackup) {
      setBackupError('Please select a backup file first');
      return;
    }

    if (!backupPassword) {
      setBackupError('Please enter the backup password');
      return;
    }

    setIsProcessing(true);

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'IMPORT_CREDENTIALS',
        backup: pendingBackup,
        password: backupPassword,
      });

      if (!response.success) {
        setBackupError(response.error || 'Import failed');
        return;
      }

      const { added, skipped } = response;
      let message = `Imported ${added} credential(s)`;
      if (skipped > 0) {
        message += `, ${skipped} skipped (duplicates)`;
      }
      setBackupSuccess(message);
      setBackupPassword('');
      setPendingBackup(null);

      // Close modal after brief delay
      setTimeout(() => {
        setShowImportModal(false);
        resetBackupState();
      }, 2000);
    } catch (err) {
      setBackupError((err as Error).message);
    } finally {
      setIsProcessing(false);
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
          <h3>Backup & Recovery</h3>

          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 12 }}>
            Create encrypted backups of your credentials or restore from a previous backup.
          </p>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn btn-secondary"
              onClick={() => {
                resetBackupState();
                setShowExportModal(true);
              }}
              style={{ flex: 1 }}
            >
              Export Backup
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => {
                resetBackupState();
                setShowImportModal(true);
              }}
              style={{ flex: 1 }}
            >
              Import Backup
            </button>
          </div>
        </div>

        {/* Export Modal */}
        {showExportModal && (
          <div className="modal-overlay" onClick={() => !isProcessing && setShowExportModal(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h3>Export Credentials</h3>
              <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 12 }}>
                Create an encrypted backup file. You&apos;ll need this password to restore.
              </p>

              <input
                type="password"
                placeholder="Backup password (min 8 characters)"
                value={backupPassword}
                onChange={(e) => setBackupPassword(e.target.value)}
                disabled={isProcessing}
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
                type="password"
                placeholder="Confirm password"
                value={backupConfirmPassword}
                onChange={(e) => setBackupConfirmPassword(e.target.value)}
                disabled={isProcessing}
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

              {backupError && (
                <p style={{ color: 'var(--color-error)', fontSize: 12, marginBottom: 8 }}>
                  {backupError}
                </p>
              )}
              {backupSuccess && (
                <p style={{ color: 'var(--color-success)', fontSize: 12, marginBottom: 8 }}>
                  {backupSuccess}
                </p>
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    setShowExportModal(false);
                    resetBackupState();
                  }}
                  disabled={isProcessing}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  onClick={handleExport}
                  disabled={isProcessing || !backupPassword || !backupConfirmPassword}
                >
                  {isProcessing ? 'Exporting...' : 'Export'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Import Modal */}
        {showImportModal && (
          <div className="modal-overlay" onClick={() => !isProcessing && setShowImportModal(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h3>Import Credentials</h3>
              <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 12 }}>
                Restore credentials from an encrypted backup file.
              </p>

              <input
                type="file"
                ref={fileInputRef}
                accept=".json"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
              />

              {!pendingBackup ? (
                <button
                  className="btn btn-secondary btn-full"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isProcessing}
                  style={{ marginBottom: 8 }}
                >
                  Select Backup File
                </button>
              ) : (
                <div
                  style={{
                    padding: '8px 12px',
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-sm)',
                    marginBottom: 8,
                    fontSize: 12,
                  }}
                >
                  <div>
                    Backup from {new Date(pendingBackup.exportedAt).toLocaleDateString()}
                  </div>
                  <div style={{ color: 'var(--color-text-muted)' }}>
                    {pendingBackup.credentialCount} credential(s)
                  </div>
                </div>
              )}

              {pendingBackup && (
                <input
                  type="password"
                  placeholder="Backup password"
                  value={backupPassword}
                  onChange={(e) => setBackupPassword(e.target.value)}
                  disabled={isProcessing}
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
              )}

              {backupError && (
                <p style={{ color: 'var(--color-error)', fontSize: 12, marginBottom: 8 }}>
                  {backupError}
                </p>
              )}
              {backupSuccess && (
                <p style={{ color: 'var(--color-success)', fontSize: 12, marginBottom: 8 }}>
                  {backupSuccess}
                </p>
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    setShowImportModal(false);
                    resetBackupState();
                  }}
                  disabled={isProcessing}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  onClick={handleImport}
                  disabled={isProcessing || !pendingBackup || !backupPassword}
                >
                  {isProcessing ? 'Importing...' : 'Import'}
                </button>
              </div>
            </div>
          </div>
        )}

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
