/**
 * Tests for IssuerTrustStore
 *
 * Tests the issuer whitelist management and trust assessment functionality.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  IssuerTrustStore,
  getTrustLevelUI,
  type TrustedIssuer,
} from '../../src/shared/storage/issuer-trust';
import { setMockStorage, getMockStorage } from '../setup';

// Valid 64-char hex address for testing
const VALID_ADDRESS_1 = 'a'.repeat(64);
const VALID_ADDRESS_2 = 'b'.repeat(64);
const VALID_ADDRESS_3 = 'c'.repeat(64);
const INVALID_ADDRESS_SHORT = 'abc123';
const INVALID_ADDRESS_CHARS = 'g'.repeat(64); // 'g' is not a hex char

describe('IssuerTrustStore', () => {
  let store: IssuerTrustStore;

  beforeEach(() => {
    // Reset singleton and storage before each test
    IssuerTrustStore.resetInstance();
    setMockStorage({});
    store = IssuerTrustStore.getInstance();
  });

  describe('singleton pattern', () => {
    it('returns the same instance', () => {
      const instance1 = IssuerTrustStore.getInstance();
      const instance2 = IssuerTrustStore.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('creates new instance after reset', () => {
      const instance1 = IssuerTrustStore.getInstance();
      IssuerTrustStore.resetInstance();
      const instance2 = IssuerTrustStore.getInstance();
      expect(instance1).not.toBe(instance2);
    });
  });

  describe('addToWhitelist', () => {
    it('adds a valid issuer to the whitelist', async () => {
      await store.addToWhitelist({
        address: VALID_ADDRESS_1,
        name: 'Test Issuer',
      });

      const issuers = await store.getAllWhitelisted();
      expect(issuers).toHaveLength(1);
      expect(issuers[0].address).toBe(VALID_ADDRESS_1);
      expect(issuers[0].name).toBe('Test Issuer');
      expect(issuers[0].addedAt).toBeGreaterThan(0);
    });

    it('adds issuer with credential types restriction', async () => {
      await store.addToWhitelist({
        address: VALID_ADDRESS_1,
        name: 'Age Verifier',
        credentialTypes: ['AGE'],
      });

      const issuer = await store.getWhitelistedIssuer(VALID_ADDRESS_1);
      expect(issuer?.credentialTypes).toEqual(['AGE']);
    });

    it('updates existing issuer instead of duplicating', async () => {
      await store.addToWhitelist({
        address: VALID_ADDRESS_1,
        name: 'Original Name',
      });

      await store.addToWhitelist({
        address: VALID_ADDRESS_1,
        name: 'Updated Name',
      });

      const issuers = await store.getAllWhitelisted();
      expect(issuers).toHaveLength(1);
      expect(issuers[0].name).toBe('Updated Name');
    });

    it('rejects invalid address format (too short)', async () => {
      await expect(
        store.addToWhitelist({
          address: INVALID_ADDRESS_SHORT,
          name: 'Invalid',
        })
      ).rejects.toThrow('Invalid issuer address format');
    });

    it('rejects invalid address format (non-hex characters)', async () => {
      await expect(
        store.addToWhitelist({
          address: INVALID_ADDRESS_CHARS,
          name: 'Invalid',
        })
      ).rejects.toThrow('Invalid issuer address format');
    });

    it('persists to chrome.storage.local', async () => {
      await store.addToWhitelist({
        address: VALID_ADDRESS_1,
        name: 'Test Issuer',
      });

      const storage = getMockStorage();
      expect(storage.trustedIssuers).toBeDefined();
      expect(Array.isArray(storage.trustedIssuers)).toBe(true);
      expect((storage.trustedIssuers as TrustedIssuer[]).length).toBe(1);
    });
  });

  describe('removeFromWhitelist', () => {
    it('removes an existing issuer', async () => {
      await store.addToWhitelist({
        address: VALID_ADDRESS_1,
        name: 'Test Issuer',
      });

      const removed = await store.removeFromWhitelist(VALID_ADDRESS_1);

      expect(removed).toBe(true);
      const issuers = await store.getAllWhitelisted();
      expect(issuers).toHaveLength(0);
    });

    it('returns false when issuer not found', async () => {
      const removed = await store.removeFromWhitelist(VALID_ADDRESS_1);
      expect(removed).toBe(false);
    });

    it('only removes the specified issuer', async () => {
      await store.addToWhitelist({ address: VALID_ADDRESS_1, name: 'Issuer 1' });
      await store.addToWhitelist({ address: VALID_ADDRESS_2, name: 'Issuer 2' });
      await store.addToWhitelist({ address: VALID_ADDRESS_3, name: 'Issuer 3' });

      await store.removeFromWhitelist(VALID_ADDRESS_2);

      const issuers = await store.getAllWhitelisted();
      expect(issuers).toHaveLength(2);
      expect(issuers.map((i) => i.address)).toContain(VALID_ADDRESS_1);
      expect(issuers.map((i) => i.address)).toContain(VALID_ADDRESS_3);
      expect(issuers.map((i) => i.address)).not.toContain(VALID_ADDRESS_2);
    });
  });

  describe('getWhitelistedIssuer', () => {
    it('returns issuer when found', async () => {
      await store.addToWhitelist({
        address: VALID_ADDRESS_1,
        name: 'Test Issuer',
      });

      const issuer = await store.getWhitelistedIssuer(VALID_ADDRESS_1);

      expect(issuer).not.toBeNull();
      expect(issuer?.name).toBe('Test Issuer');
    });

    it('returns null when not found', async () => {
      const issuer = await store.getWhitelistedIssuer(VALID_ADDRESS_1);
      expect(issuer).toBeNull();
    });
  });

  describe('isWhitelisted', () => {
    it('returns true for whitelisted issuer', async () => {
      await store.addToWhitelist({
        address: VALID_ADDRESS_1,
        name: 'Test Issuer',
      });

      const isWhitelisted = await store.isWhitelisted(VALID_ADDRESS_1);
      expect(isWhitelisted).toBe(true);
    });

    it('returns false for non-whitelisted issuer', async () => {
      const isWhitelisted = await store.isWhitelisted(VALID_ADDRESS_1);
      expect(isWhitelisted).toBe(false);
    });
  });

  describe('clearWhitelist', () => {
    it('removes all issuers', async () => {
      await store.addToWhitelist({ address: VALID_ADDRESS_1, name: 'Issuer 1' });
      await store.addToWhitelist({ address: VALID_ADDRESS_2, name: 'Issuer 2' });

      await store.clearWhitelist();

      const issuers = await store.getAllWhitelisted();
      expect(issuers).toHaveLength(0);
    });
  });

  describe('assessTrust', () => {
    it('returns "unknown" for empty address', async () => {
      const result = await store.assessTrust('');

      expect(result.level).toBe('unknown');
      expect(result.warnings).toContain('No issuer address provided');
    });

    it('returns "unknown" for invalid address format', async () => {
      const result = await store.assessTrust(INVALID_ADDRESS_SHORT);

      expect(result.level).toBe('unknown');
      expect(result.warnings).toContain('Issuer address format is invalid');
    });

    it('returns "whitelisted" for trusted issuer', async () => {
      await store.addToWhitelist({
        address: VALID_ADDRESS_1,
        name: 'Trusted Issuer',
      });

      const result = await store.assessTrust(VALID_ADDRESS_1);

      expect(result.level).toBe('whitelisted');
      expect(result.issuerName).toBe('Trusted Issuer');
      expect(result.warnings).toHaveLength(0);
    });

    it('returns "self-attested" for valid but untrusted address', async () => {
      const result = await store.assessTrust(VALID_ADDRESS_1);

      expect(result.level).toBe('self-attested');
      expect(result.warnings).toContain('Issuer is not in your trusted list');
    });

    it('checks credential type restriction', async () => {
      await store.addToWhitelist({
        address: VALID_ADDRESS_1,
        name: 'Age Only Issuer',
        credentialTypes: ['AGE'],
      });

      // Matching type
      const ageResult = await store.assessTrust(VALID_ADDRESS_1, 'AGE');
      expect(ageResult.level).toBe('whitelisted');

      // Non-matching type
      const tokenResult = await store.assessTrust(VALID_ADDRESS_1, 'TOKEN_BALANCE');
      expect(tokenResult.level).toBe('self-attested');
      expect(tokenResult.warnings).toContain('Issuer is trusted but not for TOKEN_BALANCE credentials');
    });

    it('allows any type when no restriction set', async () => {
      await store.addToWhitelist({
        address: VALID_ADDRESS_1,
        name: 'Universal Issuer',
        // No credentialTypes restriction
      });

      const ageResult = await store.assessTrust(VALID_ADDRESS_1, 'AGE');
      expect(ageResult.level).toBe('whitelisted');

      const tokenResult = await store.assessTrust(VALID_ADDRESS_1, 'TOKEN_BALANCE');
      expect(tokenResult.level).toBe('whitelisted');
    });
  });
});

describe('getTrustLevelUI', () => {
  it('returns correct UI for verified level', () => {
    const ui = getTrustLevelUI('verified');
    expect(ui.label).toBe('Verified');
    expect(ui.color).toBe('#22c55e');
  });

  it('returns correct UI for whitelisted level', () => {
    const ui = getTrustLevelUI('whitelisted');
    expect(ui.label).toBe('Trusted');
    expect(ui.color).toBe('#3b82f6');
  });

  it('returns correct UI for self-attested level', () => {
    const ui = getTrustLevelUI('self-attested');
    expect(ui.label).toBe('Unverified');
    expect(ui.color).toBe('#eab308');
  });

  it('returns correct UI for unknown level', () => {
    const ui = getTrustLevelUI('unknown');
    expect(ui.label).toBe('Unknown');
    expect(ui.color).toBe('#ef4444');
  });
});
