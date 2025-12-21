/**
 * useMaskID - Access the MaskID client instance
 */

import type { MaskIDClient } from '@maskid/core';
import { useMaskIDContext } from '../components/MaskIDProvider';

export function useMaskID(): MaskIDClient {
  const { client } = useMaskIDContext();
  return client;
}
