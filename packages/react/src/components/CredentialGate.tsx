/**
 * CredentialGate - Gate content behind verification
 */

import { useState, useEffect, type ReactNode } from 'react';
import type { VerificationType, PolicyConfig } from '@maskid/core';
import { useMaskIDContext } from './MaskIDProvider';

export interface VerificationRequirement {
  type: VerificationType;
  minAge?: number;
  token?: string;
  minBalance?: number;
  collection?: string;
}

export interface CredentialGateProps {
  require: VerificationRequirement;
  fallback?: ReactNode;
  loading?: ReactNode;
  onVerified?: () => void;
  persistSession?: boolean;
  sessionDuration?: number;
  children: ReactNode;
}

export function CredentialGate({
  require,
  fallback,
  loading,
  onVerified,
  persistSession = true,
  sessionDuration = 3600,
  children,
}: CredentialGateProps) {
  const { client } = useMaskIDContext();
  const [status, setStatus] = useState<'loading' | 'verified' | 'unverified'>('loading');

  useEffect(() => {
    const checkSession = () => {
      if (persistSession) {
        const sessionKey = `maskid:session:${require.type}`;
        const session = sessionStorage.getItem(sessionKey);
        if (session) {
          const { expires } = JSON.parse(session);
          if (Date.now() < expires) {
            setStatus('verified');
            return true;
          }
        }
      }
      return false;
    };

    if (!checkSession()) {
      setStatus('unverified');
    }
  }, [require.type, persistSession]);

  const handleVerify = async () => {
    setStatus('loading');

    try {
      let policy: PolicyConfig;

      switch (require.type) {
        case 'AGE':
          policy = { minAge: require.minAge ?? 18 };
          break;
        case 'TOKEN_BALANCE':
          policy = { token: require.token ?? '', minBalance: require.minBalance ?? 0 };
          break;
        case 'NFT_OWNERSHIP':
          policy = { collection: require.collection ?? '' };
          break;
        default:
          throw new Error(`Unsupported verification type: ${require.type}`);
      }

      const result = await client.verify({ type: require.type, policy });

      if (result.verified) {
        if (persistSession) {
          const sessionKey = `maskid:session:${require.type}`;
          sessionStorage.setItem(
            sessionKey,
            JSON.stringify({ expires: Date.now() + sessionDuration * 1000 })
          );
        }
        setStatus('verified');
        onVerified?.();
      } else {
        setStatus('unverified');
      }
    } catch {
      setStatus('unverified');
    }
  };

  if (status === 'loading') {
    return <>{loading ?? <div>Loading...</div>}</>;
  }

  if (status === 'verified') {
    return <>{children}</>;
  }

  return (
    <>
      {fallback ?? (
        <div>
          <p>Verification required</p>
          <button onClick={handleVerify}>Verify to continue</button>
        </div>
      )}
    </>
  );
}
