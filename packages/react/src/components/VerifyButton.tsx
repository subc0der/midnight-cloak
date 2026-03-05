/**
 * VerifyButton - Pre-built button component for verification
 */

import { useState, useId, type ReactNode, type ButtonHTMLAttributes } from 'react';
import type { VerificationResult, VerificationType, PolicyConfig } from '@midnight-cloak/core';
import { useMidnightCloakContext } from './MidnightCloakProvider';
import { inferTypeFromPolicy, buildPolicyFromConvenienceProps } from '../utils/policy-utils';

export interface VerifyButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'onError' | 'onClick'> {
  /**
   * Type of verification to perform.
   * Used with convenience props (minAge, token, etc.) to construct the policy.
   * If `policy` prop is provided, this is ignored.
   */
  verificationType?: VerificationType;
  /**
   * @deprecated Use `verificationType` instead. The `type` prop shadows native button type.
   */
  type?: VerificationType;
  /** Minimum age for AGE verification (default: 18) */
  minAge?: number;
  /** Token identifier for TOKEN_BALANCE verification */
  token?: string;
  /** Minimum balance for TOKEN_BALANCE verification */
  minBalance?: number;
  /** Collection ID for NFT_OWNERSHIP verification */
  collection?: string;
  /**
   * Full policy configuration. When provided, takes precedence over
   * verificationType and convenience props (minAge, token, etc.).
   */
  policy?: PolicyConfig;
  /** Called when verification succeeds */
  onVerified?: (result: VerificationResult) => void;
  /** Called when user denies verification */
  onDenied?: () => void;
  /** Called when verification encounters an error */
  onVerificationError?: (error: Error) => void;
  children?: ReactNode;
}

/**
 * Pre-built button component for identity verification.
 *
 * @example
 * ```tsx
 * // Using policy prop (recommended)
 * <VerifyButton
 *   policy={{ kind: 'age', minAge: 21 }}
 *   onVerified={(result) => console.log('Verified!', result)}
 * />
 *
 * // Using convenience props
 * <VerifyButton
 *   verificationType="AGE"
 *   minAge={21}
 *   onVerified={(result) => console.log('Verified!', result)}
 * />
 * ```
 */
export function VerifyButton({
  verificationType,
  type: deprecatedType,
  minAge,
  token,
  minBalance,
  collection,
  policy: providedPolicy,
  onVerified,
  onDenied,
  onVerificationError,
  disabled,
  children,
  ...buttonProps
}: VerifyButtonProps) {
  const { client } = useMidnightCloakContext();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const errorId = useId();

  // Support both verificationType (new) and type (deprecated)
  const verifyType = verificationType ?? deprecatedType;

  const handleClick = async () => {
    setIsLoading(true);
    setError(null);

    try {
      let policy: PolicyConfig;

      // If policy prop is provided, use it directly
      if (providedPolicy) {
        policy = providedPolicy;
      } else if (verifyType) {
        // Otherwise, construct policy from convenience props using shared utility
        policy = buildPolicyFromConvenienceProps(verifyType, {
          minAge,
          token,
          minBalance,
          collection,
        });
      } else {
        throw new Error('Either policy or verificationType must be provided');
      }

      // Infer verification type from policy kind if using policy prop
      const requestType: VerificationType = verifyType ?? inferTypeFromPolicy(policy);

      const result = await client.verify({ type: requestType, policy });

      if (result.verified) {
        onVerified?.(result);
      } else {
        onDenied?.();
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      onVerificationError?.(error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <button
        {...buttonProps}
        disabled={disabled || isLoading}
        onClick={handleClick}
        aria-busy={isLoading}
        aria-describedby={error ? errorId : undefined}
      >
        <span aria-live="polite">
          {isLoading ? 'Verifying...' : children ?? 'Verify'}
        </span>
      </button>
      {error && (
        <span id={errorId} role="alert" className="sr-only">
          {error.message}
        </span>
      )}
    </>
  );
}
