import { useState, useEffect } from 'react';
import type { PersistedVerificationRequest } from '../../shared/storage/request-queue';
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
  AGE: (config) => {
    const policy = config.policy as Record<string, unknown> | undefined;
    const minAge = policy?.minAge ?? config.minAge ?? 18;
    return `Prove you are ${minAge}+`;
  },
  TOKEN_BALANCE: (config) => {
    const policy = config.policy as Record<string, unknown> | undefined;
    const minBalance = policy?.minBalance ?? config.minBalance ?? 0;
    const token = policy?.token ?? config.token ?? 'tokens';
    return `Prove you hold ${minBalance} ${token}`;
  },
  NFT_OWNERSHIP: (config) => {
    const policy = config.policy as Record<string, unknown> | undefined;
    const collection = policy?.collection ?? config.collection ?? 'NFT';
    return `Prove you own ${collection}`;
  },
  RESIDENCY: (config) => {
    const policy = config.policy as Record<string, unknown> | undefined;
    const region = policy?.region ?? config.region ?? 'specified region';
    return `Prove residency in ${region}`;
  },
  ACCREDITED: () => 'Prove accredited investor status',
};

export default function VerificationRequest({ onComplete }: VerificationRequestProps) {
  const [request, setRequest] = useState<PersistedVerificationRequest | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [matchingCredential, setMatchingCredential] = useState<Credential | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPendingRequests();
  }, []);

  async function loadPendingRequests() {
    try {
      // Get all pending requests to show count
      const allResponse = await chrome.runtime.sendMessage({ type: 'GET_ALL_PENDING_REQUESTS' });

      if (allResponse.success && allResponse.requests?.length > 0) {
        setPendingCount(allResponse.requests.length);
        // Use the first (oldest) request
        const firstRequest = allResponse.requests[0];
        setRequest(firstRequest);
        await findMatchingCredential(firstRequest);
      } else {
        // No pending requests
        onComplete();
      }
    } catch (err) {
      console.error('Failed to load pending requests:', err);
      setError('Failed to load request');
    } finally {
      setLoading(false);
    }
  }

  async function findMatchingCredential(req: PersistedVerificationRequest) {
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
    if (!request) return;

    setProcessing(true);
    setError(null);

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'APPROVE_VERIFICATION',
        requestId: request.id,
      });

      if (response.success) {
        // Check if there are more pending requests
        await checkForMoreRequests();
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
    if (!request) return;

    setProcessing(true);

    try {
      await chrome.runtime.sendMessage({
        type: 'DENY_VERIFICATION',
        requestId: request.id,
      });
      // Check if there are more pending requests
      await checkForMoreRequests();
    } catch (err) {
      console.error('Failed to deny:', err);
      onComplete();
    }
  }

  async function checkForMoreRequests() {
    setLoading(true);
    setProcessing(false);
    setError(null);
    setRequest(null);
    setMatchingCredential(null);
    await loadPendingRequests();
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
        <h1>
          Verification Request
          {pendingCount > 1 && (
            <span className="pending-badge" title={`${pendingCount} requests pending`}>
              {pendingCount}
            </span>
          )}
        </h1>
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
