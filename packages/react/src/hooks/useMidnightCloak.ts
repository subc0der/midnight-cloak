/**
 * useMidnightCloak - Access the Midnight Cloak client instance
 */

import type { MidnightCloakClient } from '@midnight-cloak/core';
import { useMidnightCloakContext } from '../components/MidnightCloakProvider';

export function useMidnightCloak(): MidnightCloakClient {
  const { client } = useMidnightCloakContext();
  return client;
}
