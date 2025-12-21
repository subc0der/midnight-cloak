/**
 * MaskIDProvider - Context provider for React integration
 */

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { MaskIDClient, type Network } from '@maskid/core';

interface MaskIDContextValue {
  client: MaskIDClient;
}

const MaskIDContext = createContext<MaskIDContextValue | null>(null);

export interface MaskIDProviderProps {
  apiKey: string;
  network: Network;
  proofServerUrl?: string;
  onError?: (error: Error) => void;
  children: ReactNode;
}

export function MaskIDProvider({
  apiKey,
  network,
  proofServerUrl,
  children,
}: MaskIDProviderProps) {
  const client = useMemo(
    () =>
      new MaskIDClient({
        network,
        apiKey,
        proofServerUrl,
      }),
    [apiKey, network, proofServerUrl]
  );

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
