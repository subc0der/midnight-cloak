/**
 * VerifyButton - Pre-built button component for verification
 */

import { useState, type ReactNode, type ButtonHTMLAttributes } from 'react';
import type { VerificationResult, VerificationType, PolicyConfig } from '@maskid/core';
import { useMaskIDContext } from './MaskIDProvider';

export interface VerifyButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'onError' | 'onClick'> {
  type: VerificationType;
  minAge?: number;
  token?: string;
  minBalance?: number;
  collection?: string;
  policy?: PolicyConfig;
  onVerified?: (result: VerificationResult) => void;
  onDenied?: () => void;
  onVerificationError?: (error: Error) => void;
  children?: ReactNode;
}

export function VerifyButton({
  type,
  minAge,
  token,
  minBalance,
  collection,
  onVerified,
  onDenied,
  onVerificationError,
  disabled,
  children,
  ...buttonProps
}: VerifyButtonProps) {
  const { client } = useMaskIDContext();
  const [isLoading, setIsLoading] = useState(false);

  const handleClick = async () => {
    setIsLoading(true);

    try {
      let policy: PolicyConfig | undefined;

      switch (type) {
        case 'AGE':
          policy = { minAge: minAge ?? 18 };
          break;
        case 'TOKEN_BALANCE':
          policy = { token: token ?? '', minBalance: minBalance ?? 0 };
          break;
        case 'NFT_OWNERSHIP':
          policy = { collection: collection ?? '' };
          break;
        default:
          throw new Error(`Unsupported verification type: ${type}`);
      }

      const result = await client.verify({ type, policy });

      if (result.verified) {
        onVerified?.(result);
      } else {
        onDenied?.();
      }
    } catch (error) {
      onVerificationError?.(error instanceof Error ? error : new Error(String(error)));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button {...buttonProps} disabled={disabled || isLoading} onClick={handleClick}>
      {isLoading ? 'Verifying...' : children ?? 'Verify'}
    </button>
  );
}
