import { useState, useEffect } from 'react';
import type { PersistedCredentialOffer } from '../../shared/storage/request-queue';
import {
  IssuerTrustStore,
  getTrustLevelUI,
  type IssuerTrustAssessment,
} from '../../shared/storage/issuer-trust';

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
  const [offer, setOffer] = useState<PersistedCredentialOffer | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [trustAssessment, setTrustAssessment] = useState<IssuerTrustAssessment | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPendingOffers();
  }, []);

  async function loadPendingOffers() {
    try {
      // Get all pending offers to show count
      const allResponse = await chrome.runtime.sendMessage({ type: 'GET_ALL_PENDING_OFFERS' });

      if (allResponse.success && allResponse.offers?.length > 0) {
        setPendingCount(allResponse.offers.length);
        // Use the first (oldest) offer
        const firstOffer = allResponse.offers[0];
        setOffer(firstOffer);
        // Assess issuer trust
        await assessIssuerTrust(firstOffer);
      } else {
        // No pending offers
        onComplete();
      }
    } catch (err) {
      console.error('Failed to load pending offers:', err);
      setError('Failed to load credential offer');
    } finally {
      setLoading(false);
    }
  }

  async function assessIssuerTrust(pendingOffer: PersistedCredentialOffer) {
    try {
      const trustStore = IssuerTrustStore.getInstance();
      const assessment = await trustStore.assessTrust(
        pendingOffer.credential.issuer,
        pendingOffer.credential.type
      );
      setTrustAssessment(assessment);
    } catch (err) {
      console.error('Failed to assess issuer trust:', err);
    }
  }

  async function handleAccept() {
    if (!offer) return;

    setProcessing(true);
    setError(null);

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'ACCEPT_CREDENTIAL',
        offerId: offer.id,
      });

      if (response.success) {
        // Check if there are more pending offers
        await checkForMoreOffers();
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
    if (!offer) return;

    setProcessing(true);

    try {
      await chrome.runtime.sendMessage({
        type: 'REJECT_CREDENTIAL',
        offerId: offer.id,
      });
      // Check if there are more pending offers
      await checkForMoreOffers();
    } catch (err) {
      console.error('Failed to reject:', err);
      onComplete();
    }
  }

  async function checkForMoreOffers() {
    setLoading(true);
    setProcessing(false);
    setError(null);
    setOffer(null);
    setTrustAssessment(null);
    await loadPendingOffers();
  }

  async function handleAddToTrusted() {
    if (!offer || !trustAssessment) return;

    try {
      const trustStore = IssuerTrustStore.getInstance();
      await trustStore.addToWhitelist({
        address: offer.credential.issuer,
        name: `Issuer from ${new URL(offer.origin).hostname}`,
      });
      // Re-assess trust
      await assessIssuerTrust(offer);
    } catch (err) {
      console.error('Failed to add to trusted:', err);
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

  const trustUI = trustAssessment ? getTrustLevelUI(trustAssessment.level) : null;

  return (
    <div className="app">
      <header className="header">
        <h1>
          Credential Offer
          {pendingCount > 1 && (
            <span className="pending-badge" title={`${pendingCount} offers pending`}>
              {pendingCount}
            </span>
          )}
        </h1>
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
              <div className="issuer-row">
                <span className="issuer-label">Issuer:</span>
                <span className="issuer-address" title={offer.credential.issuer}>
                  {offer.credential.issuer.slice(0, 8)}...{offer.credential.issuer.slice(-8)}
                </span>
                {trustUI && (
                  <span
                    className="trust-badge"
                    style={{ backgroundColor: trustUI.bgColor, color: trustUI.color }}
                    title={trustUI.description}
                  >
                    {trustUI.label}
                  </span>
                )}
              </div>
              {offer.credential.expiresAt && (
                <span>
                  Expires: {new Date(offer.credential.expiresAt).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Trust warnings */}
        {trustAssessment && trustAssessment.warnings.length > 0 && (
          <div className="warning-box">
            <span className="warning-icon">⚠️</span>
            <div>
              {trustAssessment.warnings.map((warning, index) => (
                <p key={index}>{warning}</p>
              ))}
              {trustAssessment.level === 'self-attested' && (
                <button
                  className="btn btn-small btn-link"
                  onClick={handleAddToTrusted}
                  disabled={processing}
                >
                  Add to trusted issuers
                </button>
              )}
            </div>
          </div>
        )}

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
