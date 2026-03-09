import { useState, useEffect } from 'react';
import type { PendingCredentialOffer } from '../../shared/messaging/types';

interface CredentialOfferProps {
  onComplete: () => void;
}

const CREDENTIAL_ICONS: Record<string, string> = {
  AGE: '🎂',
  TOKEN_BALANCE: '💰',
  NFT_OWNERSHIP: '🖼️',
  RESIDENCY: '🏠',
  ACCREDITED: '✅',
  CUSTOM: '📋',
};

export default function CredentialOffer({ onComplete }: CredentialOfferProps) {
  const [offer, setOffer] = useState<PendingCredentialOffer | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPendingOffer();
  }, []);

  async function loadPendingOffer() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_PENDING_OFFER' });

      if (response.success && response.offer) {
        setOffer(response.offer);
      } else {
        // No pending offer
        onComplete();
      }
    } catch (err) {
      console.error('Failed to load pending offer:', err);
      setError('Failed to load credential offer');
    } finally {
      setLoading(false);
    }
  }

  async function handleAccept() {
    setProcessing(true);
    setError(null);

    try {
      const response = await chrome.runtime.sendMessage({ type: 'ACCEPT_CREDENTIAL' });

      if (response.success) {
        onComplete();
      } else {
        setError(response.error || 'Failed to accept credential');
        setProcessing(false);
      }
    } catch (err) {
      setError((err as Error).message);
      setProcessing(false);
    }
  }

  async function handleReject() {
    setProcessing(true);

    try {
      await chrome.runtime.sendMessage({ type: 'REJECT_CREDENTIAL' });
      onComplete();
    } catch (err) {
      console.error('Failed to reject:', err);
      onComplete();
    }
  }

  function formatClaims(claims: Record<string, unknown>): string[] {
    return Object.entries(claims).map(([key, value]) => {
      const formattedKey = key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase());
      return `${formattedKey}: ${String(value)}`;
    });
  }

  if (loading) {
    return (
      <div className="app">
        <div className="page center">
          <div className="spinner" />
        </div>
      </div>
    );
  }

  if (!offer) {
    return null;
  }

  const icon = CREDENTIAL_ICONS[offer.credential.type] || '📋';

  return (
    <div className="app">
      <header className="header">
        <h1>Credential Offer</h1>
        <button
          className="btn-icon"
          onClick={handleReject}
          title="Close"
          disabled={processing}
        >
          ✕
        </button>
      </header>

      <div className="page">
        <div className="request-origin">
          <span className="origin-icon">🌐</span>
          <span className="origin-text">{offer.origin}</span>
        </div>

        <div className="request-section">
          <label>Offering credential:</label>
          <div className="credential-card-large">
            <div className="credential-header">
              <span className="credential-icon-large">{icon}</span>
              <h2>{offer.credential.type.replace('_', ' ')}</h2>
            </div>

            <div className="credential-claims">
              {formatClaims(offer.credential.claims).map((claim, index) => (
                <div key={index} className="claim-row">
                  {claim}
                </div>
              ))}
            </div>

            <div className="credential-meta">
              <span>Issuer: {offer.credential.issuer}</span>
              {offer.credential.expiresAt && (
                <span>
                  Expires: {new Date(offer.credential.expiresAt).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="info-box">
          <p>This credential will be stored securely in your wallet and can be used for verification requests.</p>
        </div>

        {error && (
          <div className="error-box">
            <p>{error}</p>
          </div>
        )}

        <div className="button-row">
          <button
            className="btn btn-secondary"
            onClick={handleReject}
            disabled={processing}
          >
            Reject
          </button>
          <button
            className="btn btn-primary"
            onClick={handleAccept}
            disabled={processing}
          >
            {processing ? 'Saving...' : 'Accept'}
          </button>
        </div>
      </div>
    </div>
  );
}
