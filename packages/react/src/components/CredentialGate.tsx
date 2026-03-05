/**
 * CredentialGate - Gate content behind verification
 */

import { useState, useEffect, useCallback, useId, useRef, type ReactNode } from 'react';
import type { VerificationType, PolicyConfig, VerificationResult } from '@midnight-cloak/core';
import { useMidnightCloakContext } from './MidnightCloakProvider';

/**
 * Verification requirement using convenience props.
 * @deprecated Consider using `policy` prop directly for type safety.
 */
export interface VerificationRequirement {
  /**
   * Type of verification to perform.
   * @deprecated Use `verificationType` instead.
   */
  type?: VerificationType;
  /** Type of verification to perform */
  verificationType?: VerificationType;
  /** Minimum age for AGE verification */
  minAge?: number;
  /** Token identifier for TOKEN_BALANCE verification */
  token?: string;
  /** Minimum balance for TOKEN_BALANCE verification */
  minBalance?: number;
  /** Collection ID for NFT_OWNERSHIP verification */
  collection?: string;
  /** Country code for RESIDENCY verification */
  country?: string;
  /** Region code for RESIDENCY verification */
  region?: string;
}

export type GateStatus = 'loading' | 'verified' | 'unverified' | 'error';

export interface CredentialGateRenderProps {
  status: GateStatus;
  error: Error | null;
  verify: () => Promise<void>;
  reset: () => void;
  isLoading: boolean;
}

export interface CredentialGateProps {
  /**
   * Verification requirement using convenience props.
   * Either `require` or `policy` must be provided.
   */
  require?: VerificationRequirement;
  /**
   * Full policy configuration. When provided, takes precedence over `require`.
   * This is the recommended approach for type safety.
   */
  policy?: PolicyConfig;
  /** Content to show when unverified (can be a render prop) */
  fallback?: ReactNode | ((props: CredentialGateRenderProps) => ReactNode);
  /** Content to show while loading */
  loading?: ReactNode;
  /** Called when verification succeeds */
  onVerified?: (result: VerificationResult) => void;
  /** Called when verification fails */
  onError?: (error: Error) => void;
  /** Whether to persist verification in sessionStorage (default: true) */
  persistSession?: boolean;
  /** Session duration in seconds (default: 3600 = 1 hour) */
  sessionDuration?: number;
  /** Content to show when verified */
  children: ReactNode;
}

/**
 * Generate a session key that includes policy parameters to prevent security bypass.
 * For example, a minAge:18 verification should not satisfy minAge:21.
 */
function getSessionKey(policy: PolicyConfig): string {
  const parts = [`midnight-cloak:session:${policy.kind}`];

  switch (policy.kind) {
    case 'age':
      parts.push(`minAge:${policy.minAge}`);
      break;
    case 'token_balance':
      parts.push(`token:${policy.token}`, `minBalance:${policy.minBalance}`);
      break;
    case 'nft_ownership':
      parts.push(`collection:${policy.collection}`);
      if (policy.minCount !== undefined) {
        parts.push(`minCount:${policy.minCount}`);
      }
      break;
    case 'residency':
      parts.push(`country:${policy.country}`);
      if (policy.region !== undefined) {
        parts.push(`region:${policy.region}`);
      }
      break;
  }

  return parts.join(':');
}

/**
 * Build PolicyConfig from VerificationRequirement convenience props.
 */
function buildPolicyFromRequirement(require: VerificationRequirement): PolicyConfig {
  const verifyType = require.verificationType ?? require.type;

  if (!verifyType) {
    throw new Error('Either verificationType or type must be provided in require prop');
  }

  switch (verifyType) {
    case 'AGE':
      return { kind: 'age', minAge: require.minAge ?? 18 };
    case 'TOKEN_BALANCE':
      return { kind: 'token_balance', token: require.token ?? '', minBalance: require.minBalance ?? 0 };
    case 'NFT_OWNERSHIP':
      return { kind: 'nft_ownership', collection: require.collection ?? '' };
    case 'RESIDENCY':
      if (!require.country) {
        throw new Error('RESIDENCY verification requires country');
      }
      return { kind: 'residency', country: require.country, region: require.region };
    default:
      throw new Error(`Unsupported verification type: ${verifyType}`);
  }
}

/**
 * Infer VerificationType from PolicyConfig kind.
 */
function inferTypeFromPolicy(policy: PolicyConfig): VerificationType {
  switch (policy.kind) {
    case 'age':
      return 'AGE';
    case 'token_balance':
      return 'TOKEN_BALANCE';
    case 'nft_ownership':
      return 'NFT_OWNERSHIP';
    case 'residency':
      return 'RESIDENCY';
    default:
      throw new Error(`Unknown policy kind: ${(policy as { kind: string }).kind}`);
  }
}

/**
 * Gate content behind identity verification.
 *
 * @example
 * ```tsx
 * // Using policy prop (recommended)
 * <CredentialGate policy={{ kind: 'age', minAge: 21 }}>
 *   <RestrictedContent />
 * </CredentialGate>
 *
 * // Using require prop with convenience props
 * <CredentialGate require={{ verificationType: 'AGE', minAge: 21 }}>
 *   <RestrictedContent />
 * </CredentialGate>
 *
 * // With custom fallback
 * <CredentialGate
 *   policy={{ kind: 'age', minAge: 21 }}
 *   fallback={({ verify, error }) => (
 *     <div>
 *       <p>You must be 21+ to view this content</p>
 *       {error && <p className="error">{error.message}</p>}
 *       <button onClick={verify}>Verify Age</button>
 *     </div>
 *   )}
 * >
 *   <RestrictedContent />
 * </CredentialGate>
 * ```
 */
export function CredentialGate({
  require,
  policy: providedPolicy,
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
  const errorId = useId();
  const verifyButtonRef = useRef<HTMLButtonElement>(null);

  // Resolve policy from props
  const policy = providedPolicy ?? (require ? buildPolicyFromRequirement(require) : null);

  if (!policy) {
    throw new Error('CredentialGate requires either policy or require prop');
  }

  const sessionKey = getSessionKey(policy);

  // Check session storage after mount (SSR-safe)
  useEffect(() => {
    if (!persistSession) {
      setStatus('unverified');
      return;
    }

    // Only access sessionStorage in browser
    if (typeof window === 'undefined') {
      setStatus('unverified');
      return;
    }

    try {
      const session = sessionStorage.getItem(sessionKey);
      if (session) {
        const parsed = JSON.parse(session) as unknown;
        if (
          typeof parsed === 'object' &&
          parsed !== null &&
          'expires' in parsed &&
          typeof (parsed as { expires: unknown }).expires === 'number'
        ) {
          const expires = (parsed as { expires: number }).expires;
          if (Date.now() < expires) {
            setStatus('verified');
            return;
          }
        }
      }
    } catch {
      // Invalid session, continue to unverified
    }

    setStatus('unverified');
  }, [sessionKey, persistSession]);

  const handleVerify = useCallback(async () => {
    setStatus('loading');
    setError(null);

    try {
      const requestType = inferTypeFromPolicy(policy);
      const result = await client.verify({ type: requestType, policy });

      if (result.verified) {
        if (persistSession && typeof window !== 'undefined') {
          sessionStorage.setItem(
            sessionKey,
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
  }, [client, policy, sessionKey, persistSession, sessionDuration, onVerified, onError]);

  const handleReset = useCallback(() => {
    setStatus('unverified');
    setError(null);
  }, []);

  // Focus management: move focus to verify button on error
  useEffect(() => {
    if (status === 'error' && verifyButtonRef.current) {
      verifyButtonRef.current.focus();
    }
  }, [status]);

  if (status === 'loading') {
    return (
      <div aria-busy="true" aria-live="polite">
        {loading ?? <div>Loading...</div>}
      </div>
    );
  }

  if (status === 'verified') {
    return <>{children}</>;
  }

  // Render props for fallback (at this point, status is either 'unverified' or 'error')
  const renderProps: CredentialGateRenderProps = {
    status,
    error,
    verify: handleVerify,
    reset: handleReset,
    isLoading: false, // We already returned early for loading state
  };

  // Support render prop pattern for fallback
  if (typeof fallback === 'function') {
    return <>{fallback(renderProps)}</>;
  }

  return (
    <>
      {fallback ?? (
        <div role="region" aria-label="Verification required">
          <p>Verification required</p>
          {error && (
            <p id={errorId} role="alert" style={{ color: 'red' }}>
              {error.message}
            </p>
          )}
          <button
            ref={verifyButtonRef}
            onClick={handleVerify}
            aria-describedby={error ? errorId : undefined}
          >
            {status === 'error' ? 'Try Again' : 'Verify to continue'}
          </button>
        </div>
      )}
    </>
  );
}
