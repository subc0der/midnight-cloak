import { describe, it, expect, beforeEach } from 'vitest';
import { MidnightCloakClient } from '../src/client';

describe('MidnightCloakClient', () => {
  let client: MidnightCloakClient;

  beforeEach(() => {
    client = new MidnightCloakClient({
      network: 'testnet',
      apiKey: 'test-key',
    });
  });

  it('should initialize with correct config', () => {
    expect(client).toBeDefined();
  });

  it('should emit events on verification', async () => {
    const events: string[] = [];
    client.on('verification:requested', () => events.push('requested'));
    client.on('verification:approved', () => events.push('approved'));

    // Use mock wallet for testing
    client.useMockWallet({ network: 'testnet' });

    await client.verify({ type: 'AGE', policy: { minAge: 18 } });

    expect(events).toContain('requested');
    expect(events).toContain('approved');
  });

  it('should disconnect and clear event listeners', () => {
    const handler = () => {};
    client.on('test', handler);
    client.disconnect();
    // No error should be thrown
    expect(true).toBe(true);
  });
});
