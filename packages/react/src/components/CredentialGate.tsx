/**
 * CredentialGate - Gate content behind verification
 */

import { useState, useEffect, useCallback, type ReactNode } from 'react';
import type { VerificationType, PolicyConfig, VerificationResult } from '@midnight-cloak/core';
import { useMidnightCloakContext } from './MidnightCloakProvider';

export interface VerificationRequirement {
  type: VerificationType;
  minAge?: number;
  token?: string;
  minBalance?: number;
  collection?: string;
}

export type GateStatus = 'loading' | 'verified' | 'unverified' | 'error';

export interface CredentialGateRenderProps {
  status: GateStatus;
  error: Error | null;
  verify: () => Promise<void>;
  reset: () => void;
}

export interface CredentialGateProps {
  require: VerificationRequirement;
  fallback?: ReactNode | ((props: CredentialGateRenderProps) => ReactNode);
  loading?: ReactNode;
  onVerified?: (result: VerificationResult) => void;
  onError?: (error: Error) => void;
  persistSession?: boolean;
  sessionDuration?: number;
  children: ReactNode;
}

/**
 * Generate a session key that includes policy parameters to prevent security bypass.
 * For example, a minAge:18 verification should not satisfy minAge:21.
 */
function getSessionKey(require: VerificationRequirement): string {
  const parts = [`midnight-cloak:session:${require.type}`];

  // Include relevant policy params in the key
  if (require.minAge !== undefined) {
    parts.push(`minAge:${require.minAge}`);
  }
  if (require.token !== undefined) {
    parts.push(`token:${require.token}`);
  }
  if (require.minBalance !== undefined) {
    parts.push(`minBalance:${require.minBalance}`);
  }
  if (require.collection !== undefined) {
    parts.push(`collection:${require.collection}`);
  }

  return parts.join(':');
}

export function CredentialGate({
  require,
  fallback,
  loading,
  onVerified,
  onError,
  persistSession = true,
  sessionDuration = 3600,
  children,
}: CredentialGateProps) {
  const { client } = useMidnightCloakContext();
  const [status, setStatus] = useState<GateStatus>('loading');
  const [error, setError] = useState<Error | null>(null);

  // Extract primitive values for session key dependency
  const sessionKey = getSessionKey(require);

  useEffect(() => {
    const checkSession = () => {
      if (persistSession) {
        const session = sessionStorage.getItem(sessionKey);
        if (session) {
          try {
            const parsed = JSON.parse(session) as unknown;
            // Validate that parsed data has expires as a number
            if (
              typeof parsed === 'object' &&
              parsed !== null &&
              'expires' in parsed &&
              typeof (parsed as { expires: unknown }).expires === 'number'
            ) {
              const expires = (parsed as { expires: number }).expires;
              if (Date.now() < expires) {
                setStatus('verified');
                return true;
              }
            }
          } catch {
            // Invalid session, continue to unverified
          }
        }
      }
      return false;
    };

    if (!checkSession()) {
      setStatus('unverified');
    }
  }, [sessionKey, persistSession]);

  // Extract primitive values from require to avoid object reference in dependencies
  const requireType = require.type;
  const requireMinAge = require.minAge;
  const requireToken = require.token;
  const requireMinBalance = require.minBalance;
  const requireCollection = require.collection;

  const handleVerify = useCallback(async () => {
    setStatus('loading');
    setError(null);

    try {
      let policy: PolicyConfig;

      switch (requireType) {
        case 'AGE':
          policy = { minAge: requireMinAge ?? 18 };
          break;
        case 'TOKEN_BALANCE':
          policy = { token: requireToken ?? '', minBalance: requireMinBalance ?? 0 };
          break;
        case 'NFT_OWNERSHIP':
          policy = { collection: requireCollection ?? '' };
          break;
        default:
          throw new Error(`Unsupported verification type: ${requireType}`);
      }

      const result = await client.verify({ type: requireType, policy });

      if (result.verified) {
        if (persistSession) {
          // Use the same session key format that includes policy params
          const verifySessionKey = getSessionKey({
            type: requireType,
            minAge: requireMinAge,
            token: requireToken,
            minBalance: requireMinBalance,
            collection: requireCollection,
          });
          sessionStorage.setItem(
            verifySessionKey,
            JSON.stringify({ expires: Date.now() + sessionDuration * 1000 })
          );
        }
        setStatus('verified');
        onVerified?.(result);
      } else {
        const verificationError = new Error(result.error?.message || 'Verification failed');
        setError(verificationError);
        setStatus('error');
        onError?.(verificationError);
      }
    } catch (e) {
      const err = e instanceof Error ? e : new Error('Unknown error');
      setError(err);
      setStatus('error');
      onError?.(err);
    }
  }, [client, requireType, requireMinAge, requireToken, requireMinBalance, requireCollection, persistSession, sessionDuration, onVerified, onError]);

  const handleReset = useCallback(() => {
    setStatus('unverified');
    setError(null);
  }, []);

  if (status === 'loading') {
    return <>{loading ?? <div>Loading...</div>}</>;
  }

  if (status === 'verified') {
    return <>{children}</>;
  }

  // Render props for fallback
  const renderProps: CredentialGateRenderProps = {
    status,
    error,
    verify: handleVerify,
    reset: handleReset,
  };

  // Support render prop pattern for fallback
  if (typeof fallback === 'function') {
    return <>{fallback(renderProps)}</>;
  }

  return (
    <>
      {fallback ?? (
        <div>
          <p>Verification required</p>
          {error && <p style={{ color: 'red' }}>{error.message}</p>}
          <button onClick={handleVerify}>
            {status === 'error' ? 'Try Again' : 'Verify to continue'}
          </button>
        </div>
      )}
    </>
  );
}
