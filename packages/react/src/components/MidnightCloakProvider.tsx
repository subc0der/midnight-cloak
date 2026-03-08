/**
 * MidnightCloakProvider - Context provider for React integration
 */

import { createContext, useContext, useMemo, useEffect, useRef, type ReactNode } from 'react';
import { MidnightCloakClient, type Network, type WalletType } from '@midnight-cloak/core';

interface MidnightCloakContextValue {
  client: MidnightCloakClient;
}

const MidnightCloakContext = createContext<MidnightCloakContextValue | null>(null);

export interface MidnightCloakProviderProps {
  /**
   * Pre-configured client instance. When provided, apiKey and network are ignored.
   * Use this for advanced configuration or when sharing a client across providers.
   */
  client?: MidnightCloakClient;
  /** API key for metered billing (required if client not provided) */
  apiKey?: string;
  /** Target network (required if client not provided) */
  network?: Network;
  /** Custom proof server URL */
  proofServerUrl?: string;
  /** Preferred wallet type */
  preferredWallet?: WalletType;
  /**
   * Allow mock proofs when proof server is unavailable (development only).
   * SECURITY: Never enable in production.
   */
  allowMockProofs?: boolean;
  /** Called when wallet or verification errors occur */
  onError?: (error: Error) => void;
  children: ReactNode;
}

/**
 * Provider component for Midnight Cloak React integration.
 * Wrap your app with this provider to enable verification components and hooks.
 *
 * @example
 * ```tsx
 * // Basic usage
 * <MidnightCloakProvider apiKey="your-api-key" network="preprod">
 *   <App />
 * </MidnightCloakProvider>
 *
 * // With pre-configured client
 * const client = new MidnightCloakClient({ network: 'preprod', apiKey: 'key' });
 * <MidnightCloakProvider client={client}>
 *   <App />
 * </MidnightCloakProvider>
 * ```
 */
export function MidnightCloakProvider({
  client: providedClient,
  apiKey,
  network,
  proofServerUrl,
  preferredWallet,
  allowMockProofs,
  onError,
  children,
}: MidnightCloakProviderProps) {
  // Track previous client for cleanup
  const previousClientRef = useRef<MidnightCloakClient | null>(null);

  const client = useMemo(() => {
    // Use provided client if available
    if (providedClient) {
      return providedClient;
    }

    // Validate required props when not using provided client
    if (!network) {
      throw new Error('MidnightCloakProvider requires either a client prop or network prop');
    }

    return new MidnightCloakClient({
      network,
      apiKey: apiKey ?? '',
      proofServerUrl,
      preferredWallet,
      allowMockProofs,
    });
  }, [providedClient, apiKey, network, proofServerUrl, preferredWallet, allowMockProofs]);

  // Cleanup previous client when a new one is created
  useEffect(() => {
    const previousClient = previousClientRef.current;

    // If client changed and we created the previous one (not provided), clean it up
    if (previousClient && previousClient !== client && previousClient !== providedClient) {
      previousClient.disconnect();
    }

    previousClientRef.current = client;

    // Cleanup on unmount (only if we created the client)
    return () => {
      if (!providedClient && client) {
        client.disconnect();
      }
    };
  }, [client, providedClient]);

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

/**
 * Access the Midnight Cloak context. Throws if used outside of provider.
 * Prefer using `useMidnightCloak()` hook for most use cases.
 */
export function useMidnightCloakContext(): MidnightCloakContextValue {
  const context = useContext(MidnightCloakContext);
  if (!context) {
    throw new Error('useMidnightCloakContext must be used within a MidnightCloakProvider');
  }
  return context;
}
