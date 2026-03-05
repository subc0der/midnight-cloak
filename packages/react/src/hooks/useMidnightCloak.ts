/**
 * useMidnightCloak - Access the Midnight Cloak client instance and connection state
 */

import { useState, useEffect } from 'react';
import type { MidnightCloakClient } from '@midnight-cloak/core';
import { useMidnightCloakContext } from '../components/MidnightCloakProvider';

export interface UseMidnightCloakReturn {
  /** The Midnight Cloak client instance */
  client: MidnightCloakClient;
  /** Whether a wallet is currently connected */
  isConnected: boolean;
  /** Connect to a wallet */
  connect: () => Promise<void>;
  /** Disconnect the current wallet */
  disconnect: () => void;
}

/**
 * Access the Midnight Cloak client and wallet connection state.
 *
 * @example
 * ```tsx
 * function WalletStatus() {
 *   const { isConnected, connect, disconnect } = useMidnightCloak();
 *
 *   return isConnected ? (
 *     <button onClick={disconnect}>Disconnect Wallet</button>
 *   ) : (
 *     <button onClick={connect}>Connect Wallet</button>
 *   );
 * }
 * ```
 */
export function useMidnightCloak(): UseMidnightCloakReturn {
  const { client } = useMidnightCloakContext();
  const [isConnected, setIsConnected] = useState(() => client.isWalletConnected());

  useEffect(() => {
    // Sync initial state
    setIsConnected(client.isWalletConnected());

    // Listen for connection changes
    const handleConnect = () => setIsConnected(true);
    const handleDisconnect = () => setIsConnected(false);

    client.on('wallet:connected', handleConnect);
    client.on('wallet:disconnected', handleDisconnect);

    return () => {
      client.off('wallet:connected', handleConnect);
      client.off('wallet:disconnected', handleDisconnect);
    };
  }, [client]);

  const connect = async () => {
    await client.connectWallet();
  };

  const disconnect = () => {
    client.disconnectWallet();
  };

  return {
    client,
    isConnected,
    connect,
    disconnect,
  };
}
