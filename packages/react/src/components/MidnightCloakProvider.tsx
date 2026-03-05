/**
 * MidnightCloakProvider - Context provider for React integration
 */

import { createContext, useContext, useMemo, useEffect, type ReactNode } from 'react';
import { MidnightCloakClient, type Network, type WalletType } from '@midnight-cloak/core';

interface MidnightCloakContextValue {
  client: MidnightCloakClient;
}

const MidnightCloakContext = createContext<MidnightCloakContextValue | null>(null);

export interface MidnightCloakProviderProps {
  apiKey: string;
  network: Network;
  proofServerUrl?: string;
  preferredWallet?: WalletType;
  onError?: (error: Error) => void;
  children: ReactNode;
}

export function MidnightCloakProvider({
  apiKey,
  network,
  proofServerUrl,
  preferredWallet,
  onError,
  children,
}: MidnightCloakProviderProps) {
  const client = useMemo(
    () =>
      new MidnightCloakClient({
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

  return <MidnightCloakContext.Provider value={value}>{children}</MidnightCloakContext.Provider>;
}

export function useMidnightCloakContext(): MidnightCloakContextValue {
  const context = useContext(MidnightCloakContext);
  if (!context) {
    throw new Error('useMidnightCloakContext must be used within a MidnightCloakProvider');
  }
  return context;
}
