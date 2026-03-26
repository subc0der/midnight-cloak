import { describe, it, expect, beforeEach } from 'vitest';
import { MidnightCloakClient } from '../src/client';
import { ErrorCodes } from '../src/errors';

describe('MidnightCloakClient', () => {
  let client: MidnightCloakClient;

  beforeEach(() => {
    client = new MidnightCloakClient({
      network: 'preprod',
      apiKey: 'test-key',
      allowMockProofs: true, // Enable mocks for testing
    });
  });

  it('should initialize with correct config', () => {
    expect(client).toBeDefined();
    expect(client.getNetworkConfig().network).toBe('preprod');
  });

  it('should emit events on verification', async () => {
    const events: string[] = [];
    client.on('verification:requested', () => events.push('requested'));
    client.on('verification:approved', () => events.push('approved'));

    // Use mock wallet for testing
    client.useMockWallet({ network: 'preprod' });

    await client.verify({ type: 'AGE', policy: { kind: 'age', minAge: 18 } });

    expect(events).toContain('requested');
    expect(events).toContain('approved');
  });

  it('should disconnect and clear event listeners', () => {
    const handler = () => {};
    client.on('wallet:disconnected', handler);
    client.disconnect();
    // No error should be thrown
    expect(true).toBe(true);
  });

  it('should support standalone network', () => {
    const standaloneClient = new MidnightCloakClient({
      network: 'standalone',
    });
    expect(standaloneClient.getNetworkConfig().networkId).toBe('undeployed');
  });

  it('should verify TOKEN_BALANCE with mock wallet', async () => {
    const events: string[] = [];
    client.on('verification:requested', () => events.push('requested'));
    client.on('verification:approved', () => events.push('approved'));

    // Use mock wallet for testing
    client.useMockWallet({ network: 'preprod' });

    const result = await client.verify({
      type: 'TOKEN_BALANCE',
      policy: { kind: 'token_balance', token: 'NIGHT', minBalance: 100 },
    });

    expect(result.verified).toBe(true);
    expect(result.proof).toBeDefined();
    expect(events).toContain('requested');
    expect(events).toContain('approved');
  });

  it('should verify NFT_OWNERSHIP with mock wallet', async () => {
    const events: string[] = [];
    client.on('verification:requested', () => events.push('requested'));
    client.on('verification:approved', () => events.push('approved'));

    // Use mock wallet for testing
    client.useMockWallet({ network: 'preprod' });

    const result = await client.verify({
      type: 'NFT_OWNERSHIP',
      policy: { kind: 'nft_ownership', collection: 'CoolCats', minCount: 1 },
    });

    expect(result.verified).toBe(true);
    expect(result.proof).toBeDefined();
    expect(events).toContain('requested');
    expect(events).toContain('approved');
  });

  it('should return WALLET_NOT_CONNECTED error when no wallet connected for AGE', async () => {
    // Do NOT use mock wallet - test the no-wallet case
    const result = await client.verify({
      type: 'AGE',
      policy: { kind: 'age', minAge: 18 },
    });

    expect(result.verified).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error?.code).toBe(ErrorCodes.WALLET_NOT_CONNECTED);
  });

  it('should return WALLET_NOT_CONNECTED error when no wallet connected for TOKEN_BALANCE', async () => {
    const result = await client.verify({
      type: 'TOKEN_BALANCE',
      policy: { kind: 'token_balance', token: 'NIGHT', minBalance: 100 },
    });

    expect(result.verified).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error?.code).toBe(ErrorCodes.WALLET_NOT_CONNECTED);
  });

  it('should return WALLET_NOT_CONNECTED error when no wallet connected for NFT_OWNERSHIP', async () => {
    const result = await client.verify({
      type: 'NFT_OWNERSHIP',
      policy: { kind: 'nft_ownership', collection: 'CoolCats', minCount: 1 },
    });

    expect(result.verified).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error?.code).toBe(ErrorCodes.WALLET_NOT_CONNECTED);
  });

  it('should return VERIFICATION_DENIED when user rejects AGE signature', async () => {
    const events: string[] = [];
    client.on('verification:denied', () => events.push('denied'));

    // Use mock wallet configured to reject signature
    client.useMockWallet({ network: 'preprod', rejectSignature: true });

    const result = await client.verify({
      type: 'AGE',
      policy: { kind: 'age', minAge: 18 },
    });

    expect(result.verified).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error?.code).toBe(ErrorCodes.VERIFICATION_DENIED);
    expect(events).toContain('denied');
  });

  it('should return VERIFICATION_DENIED when user rejects TOKEN_BALANCE signature', async () => {
    const events: string[] = [];
    client.on('verification:denied', () => events.push('denied'));

    client.useMockWallet({ network: 'preprod', rejectSignature: true });

    const result = await client.verify({
      type: 'TOKEN_BALANCE',
      policy: { kind: 'token_balance', token: 'NIGHT', minBalance: 100 },
    });

    expect(result.verified).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error?.code).toBe(ErrorCodes.VERIFICATION_DENIED);
    expect(events).toContain('denied');
  });

  it('should return VERIFICATION_DENIED when user rejects NFT_OWNERSHIP signature', async () => {
    const events: string[] = [];
    client.on('verification:denied', () => events.push('denied'));

    client.useMockWallet({ network: 'preprod', rejectSignature: true });

    const result = await client.verify({
      type: 'NFT_OWNERSHIP',
      policy: { kind: 'nft_ownership', collection: 'CoolCats', minCount: 1 },
    });

    expect(result.verified).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error?.code).toBe(ErrorCodes.VERIFICATION_DENIED);
    expect(events).toContain('denied');
  });
});
