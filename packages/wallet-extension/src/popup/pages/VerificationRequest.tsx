import { useState, useEffect } from 'react';
import type { PendingVerificationRequest } from '../../shared/messaging/types';
import type { Credential } from '@midnight-cloak/core';

interface VerificationRequestProps {
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

const VERIFICATION_DESCRIPTIONS: Record<string, (config: Record<string, unknown>) => string> = {
  AGE: (config) => `Prove you are ${config.minAge || 18}+`,
  TOKEN_BALANCE: (config) => `Prove you hold ${config.minBalance || 0} ${config.token || 'tokens'}`,
  NFT_OWNERSHIP: (config) => `Prove you own ${config.collection || 'NFT'}`,
  RESIDENCY: (config) => `Prove residency in ${config.region || 'specified region'}`,
  ACCREDITED: () => 'Prove accredited investor status',
};

export default function VerificationRequest({ onComplete }: VerificationRequestProps) {
  const [request, setRequest] = useState<PendingVerificationRequest | null>(null);
  const [matchingCredential, setMatchingCredential] = useState<Credential | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPendingRequest();
  }, []);

  async function loadPendingRequest() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_PENDING_REQUEST' });

      if (response.success && response.request) {
        setRequest(response.request);
        await findMatchingCredential(response.request);
      } else {
        // No pending request
        onComplete();
      }
    } catch (err) {
      console.error('Failed to load pending request:', err);
      setError('Failed to load request');
    } finally {
      setLoading(false);
    }
  }

  async function findMatchingCredential(req: PendingVerificationRequest) {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_CREDENTIALS' });

      if (response.success && response.credentials) {
        const credentials = response.credentials as Credential[];
        const matching = credentials.find((cred) => {
          if (cred.type !== req.policyConfig.type) return false;
          if (cred.expiresAt && cred.expiresAt < Date.now()) return false;
          return true;
        });
        setMatchingCredential(matching || null);
      }
    } catch (err) {
      console.error('Failed to find matching credential:', err);
    }
  }

  async function handleApprove() {
    setProcessing(true);
    setError(null);

    try {
      const response = await chrome.runtime.sendMessage({ type: 'APPROVE_VERIFICATION' });

      if (response.success) {
        onComplete();
      } else {
        setError(response.error || 'Failed to approve');
        setProcessing(false);
      }
    } catch (err) {
      setError((err as Error).message);
      setProcessing(false);
    }
  }

  async function handleDeny() {
    setProcessing(true);

    try {
      await chrome.runtime.sendMessage({ type: 'DENY_VERIFICATION' });
      onComplete();
    } catch (err) {
      console.error('Failed to deny:', err);
      onComplete();
    }
  }

  function getVerificationDescription(): string {
    if (!request) return '';
    const descFn = VERIFICATION_DESCRIPTIONS[request.policyConfig.type];
    if (descFn) {
      return descFn(request.policyConfig);
    }
    return `Verify ${request.policyConfig.type}`;
  }

  function formatDate(timestamp: number): string {
    return new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
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

  if (!request) {
    return null;
  }

  const icon = CREDENTIAL_ICONS[request.policyConfig.type] || '📋';

  return (
    <div className="app">
      <header className="header">
        <h1>Verification Request</h1>
        <button
          className="btn-icon"
          onClick={handleDeny}
          title="Close"
          disabled={processing}
        >
          ✕
        </button>
      </header>

      <div className="page">
        <div className="request-origin">
          <span className="origin-icon">🌐</span>
          <span className="origin-text">{request.origin}</span>
        </div>

        <div className="request-section">
          <label>Requesting:</label>
          <div className="request-card">
            <div className="request-icon">{icon}</div>
            <div className="request-info">
              <h3>{request.policyConfig.type.replace('_', ' ')} Verification</h3>
              <p>{getVerificationDescription()}</p>
            </div>
          </div>
        </div>

        {matchingCredential ? (
          <div className="request-section">
            <label>Using credential:</label>
            <div className="credential-card compact">
              <div className="credential-icon">{icon}</div>
              <div className="credential-info">
                <h3>{matchingCredential.type.replace('_', ' ')}</h3>
                <p>Issued {formatDate(matchingCredential.issuedAt)}</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="request-section">
            <div className="warning-box">
              <span className="warning-icon">⚠️</span>
              <p>No matching credential found. You need a {request.policyConfig.type} credential to complete this verification.</p>
            </div>
          </div>
        )}

        {error && (
          <div className="error-box">
            <p>{error}</p>
          </div>
        )}

        <div className="button-row">
          <button
            className="btn btn-secondary"
            onClick={handleDeny}
            disabled={processing}
          >
            Deny
          </button>
          <button
            className="btn btn-primary"
            onClick={handleApprove}
            disabled={processing || !matchingCredential}
          >
            {processing ? 'Processing...' : 'Approve'}
          </button>
        </div>
      </div>
    </div>
  );
}
