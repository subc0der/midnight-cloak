import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ActivityEntry, ActivityEventType } from '../../shared/storage/activity-log';

const EVENT_ICONS: Record<ActivityEventType, string> = {
  verification_request: '📨',
  approval: '✅',
  denial: '❌',
  credential_offer: '🎁',
  credential_accepted: '✅',
  credential_rejected: '❌',
};

const EVENT_LABELS: Record<ActivityEventType, string> = {
  verification_request: 'Verification Request',
  approval: 'Approved',
  denial: 'Denied',
  credential_offer: 'Credential Offer',
  credential_accepted: 'Credential Accepted',
  credential_rejected: 'Credential Rejected',
};

const EVENT_COLORS: Record<ActivityEventType, string> = {
  verification_request: 'var(--color-warning)',
  approval: 'var(--color-success)',
  denial: 'var(--color-error)',
  credential_offer: 'var(--color-primary)',
  credential_accepted: 'var(--color-success)',
  credential_rejected: 'var(--color-error)',
};

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return days === 1 ? '1 day ago' : `${days} days ago`;
  }
  if (hours > 0) {
    return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  }
  if (minutes > 0) {
    return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;
  }
  return 'Just now';
}

function truncateOrigin(origin: string): string {
  try {
    const url = new URL(origin);
    return url.hostname;
  } catch {
    return origin.length > 30 ? `${origin.slice(0, 27)}...` : origin;
  }
}

export default function ActivityLog() {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);

  const loadEntries = useCallback(async () => {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GET_ACTIVITY_LOG',
      });

      if (response.success) {
        setEntries(response.entries || []);
      }
    } catch (err) {
      console.error('Failed to load activity log:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  async function handleClear() {
    setClearing(true);
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'CLEAR_ACTIVITY_LOG',
      });

      if (response.success) {
        setEntries([]);
        setShowClearConfirm(false);
      }
    } catch (err) {
      console.error('Failed to clear activity log:', err);
    } finally {
      setClearing(false);
    }
  }

  return (
    <div className="app">
      <header className="header">
        <button className="btn-icon" onClick={() => navigate('/')}>
          &larr;
        </button>
        <h1>Activity</h1>
        <div style={{ width: 32 }} />
      </header>

      <div className="page scroll-content">
        {loading ? (
          <div className="empty-state">
            <div className="spinner" />
          </div>
        ) : entries.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📋</div>
            <h3>No Activity Yet</h3>
            <p>
              Activities will appear here when dApps request credentials or you accept offers.
            </p>
          </div>
        ) : (
          <>
            <div className="activity-list">
              {entries.map((entry) => (
                <div key={entry.id} className="activity-entry">
                  <div
                    className="activity-icon"
                    style={{ background: EVENT_COLORS[entry.type] }}
                  >
                    {EVENT_ICONS[entry.type]}
                  </div>
                  <div className="activity-info">
                    <div className="activity-type">
                      {EVENT_LABELS[entry.type]}
                      <span
                        style={{
                          marginLeft: 8,
                          padding: '2px 6px',
                          background: 'var(--color-surface)',
                          borderRadius: 'var(--radius-sm)',
                          fontSize: 11,
                          color: 'var(--color-text-muted)',
                        }}
                      >
                        {entry.credentialType}
                      </span>
                    </div>
                    <div className="activity-origin">{truncateOrigin(entry.origin)}</div>
                  </div>
                  <div className="activity-time">{formatRelativeTime(entry.timestamp)}</div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 16 }}>
              {showClearConfirm ? (
                <div
                  style={{
                    padding: 12,
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)',
                  }}
                >
                  <p style={{ fontSize: 12, marginBottom: 8 }}>
                    Clear all activity history?
                  </p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      className="btn btn-secondary"
                      onClick={() => setShowClearConfirm(false)}
                      disabled={clearing}
                    >
                      Cancel
                    </button>
                    <button
                      className="btn btn-primary"
                      onClick={handleClear}
                      disabled={clearing}
                      style={{ background: 'var(--color-error)' }}
                    >
                      {clearing ? 'Clearing...' : 'Clear All'}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  className="btn btn-secondary btn-full"
                  onClick={() => setShowClearConfirm(true)}
                >
                  Clear Activity History
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
