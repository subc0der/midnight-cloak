/**
 * CredentialGate - Gate content behind verification
 */

import { useState, useEffect, useCallback, useId, useRef, type ReactNode } from 'react';
import type { PolicyConfig, VerificationResult } from '@midnight-cloak/core';
import { useMidnightCloakContext } from './MidnightCloakProvider';
import {
  inferTypeFromPolicy,
  buildPolicyFromRequirement,
  getSessionKey,
  type VerificationRequirement,
} from '../utils/policy-utils';

// Re-export for backwards compatibility
export type { VerificationRequirement } from '../utils/policy-utils';

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
