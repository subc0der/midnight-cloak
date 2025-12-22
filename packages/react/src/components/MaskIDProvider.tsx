/**
 * MaskIDProvider - Context provider for React integration
 */

import { createContext, useContext, useMemo, useEffect, type ReactNode } from 'react';
import { MaskIDClient, type Network, type WalletType } from '@maskid/core';

interface MaskIDContextValue {
  client: MaskIDClient;
}

const MaskIDContext = createContext<MaskIDContextValue | null>(null);

export interface MaskIDProviderProps {
  apiKey: string;
  network: Network;
  proofServerUrl?: string;
  preferredWallet?: WalletType;
  onError?: (error: Error) => void;
  children: ReactNode;
}

export function MaskIDProvider({
  apiKey,
  network,
  proofServerUrl,
  preferredWallet,
  onError,
  children,
}: MaskIDProviderProps) {
  const client = useMemo(
    () =>
      new MaskIDClient({
        network,
        apiKey,
        proofServerUrl,
        preferredWallet,
      }),
    [apiKey, network, proofServerUrl, preferredWallet]
  );

  // Subscribe to client errors if onError callback is provided
  useEffect(() => {
    if (!onError) {
      return;
    }

    const handleError = (error: unknown) => {
      if (error instanceof Error) {
        onError(error);
      } else {
        onError(new Error(String(error)));
      }
    };

    client.on('wallet:error', handleError);
    client.on('verification:error', handleError);

    return () => {
      client.off('wallet:error', handleError);
      client.off('verification:error', handleError);
    };
  }, [client, onError]);

  const value = useMemo(() => ({ client }), [client]);

  return <MaskIDContext.Provider value={value}>{children}</MaskIDContext.Provider>;
}

export function useMaskIDContext(): MaskIDContextValue {
  const context = useContext(MaskIDContext);
  if (!context) {
    throw new Error('useMaskIDContext must be used within a MaskIDProvider');
  }
  return context;
}
