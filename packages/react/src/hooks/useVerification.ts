/**
 * useVerification - Hook for custom verification flows
 */

import { useState, useCallback } from 'react';
import type { VerificationRequest, VerificationResult } from '@midnight-cloak/core';
import { useMidnightCloakContext } from '../components/MidnightCloakProvider';

type VerificationStatus = 'idle' | 'pending' | 'verified' | 'denied' | 'error';

export interface UseVerificationReturn {
  verify: (request: VerificationRequest) => Promise<void>;
  status: VerificationStatus;
  result: VerificationResult | null;
  error: Error | null;
  isLoading: boolean;
  reset: () => void;
}

export function useVerification(): UseVerificationReturn {
  const { client } = useMidnightCloakContext();
  const [status, setStatus] = useState<VerificationStatus>('idle');
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const verify = useCallback(
    async (request: VerificationRequest) => {
      setStatus('pending');
      setError(null);

      try {
        const verificationResult = await client.verify(request);
        setResult(verificationResult);

        if (verificationResult.verified) {
          setStatus('verified');
        } else {
          setStatus('denied');
        }
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
        setStatus('error');
      }
    },
    [client]
  );

  const reset = useCallback(() => {
    setStatus('idle');
    setResult(null);
    setError(null);
  }, []);

  return {
    verify,
    status,
    result,
    error,
    isLoading: status === 'pending',
    reset,
  };
}
