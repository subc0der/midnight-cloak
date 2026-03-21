/**
 * Issuer Trust Store for Midnight Cloak Extension
 *
 * Manages trusted issuers for credential validation.
 * Provides trust assessment for incoming credential offers.
 *
 * Trust Levels:
 * - verified:      On-chain registry (Phase 5 - requires contract integration)
 * - whitelisted:   User's local trusted list (this implementation)
 * - self-attested: Valid address format, not in trusted list
 * - unknown:       Invalid/missing address
 */

// Storage key for trusted issuers
const STORAGE_KEY = 'trustedIssuers';

/**
 * Trust level for credential issuers
 */
export type IssuerTrustLevel = 'verified' | 'whitelisted' | 'self-attested' | 'unknown';

/**
 * Trusted issuer record
 */
export interface TrustedIssuer {
  /** Midnight address of the issuer */
  address: string;
  /** Display name for the issuer */
  name: string;
  /** When the issuer was added to the whitelist */
  addedAt: number;
  /** Optional: limit to specific credential types */
  credentialTypes?: string[];
}

/**
 * Result of trust assessment
 */
export interface IssuerTrustAssessment {
  level: IssuerTrustLevel;
  issuerAddress: string;
  issuerName?: string;
  warnings: string[];
}

/**
 * Validate Midnight address format
 * Midnight addresses are 64-character hex strings (32 bytes)
 */
function isValidMidnightAddress(address: string): boolean {
  if (!address || typeof address !== 'string') {
    return false;
  }
  // Midnight addresses are 64 hex characters
  return /^[a-fA-F0-9]{64}$/.test(address);
}

/**
 * Issuer Trust Store
 *
 * Singleton class for managing trusted issuers.
 * Uses mutex locking to prevent race conditions during concurrent operations.
 */
export class IssuerTrustStore {
  private static instance: IssuerTrustStore | null = null;

  /**
   * Mutex lock to serialize storage operations.
   * Prevents race conditions when multiple operations occur simultaneously.
   */
  private operationQueue: Promise<void> = Promise.resolve();

  /**
   * Get the singleton instance
   */
  static getInstance(): IssuerTrustStore {
    if (!IssuerTrustStore.instance) {
      IssuerTrustStore.instance = new IssuerTrustStore();
    }
    return IssuerTrustStore.instance;
  }

  /**
   * Reset the singleton (for testing)
   */
  static resetInstance(): void {
    IssuerTrustStore.instance = null;
  }

  // Private constructor for singleton
  private constructor() {}

  /**
   * Execute an operation with mutex lock to prevent race conditions.
   * Operations are queued and executed serially.
   */
  private async withLock<T>(operation: () => Promise<T>): Promise<T> {
    // Chain this operation after all pending operations
    const result = this.operationQueue.then(operation);

    // Update the queue to wait for this operation (ignore errors in chain)
    this.operationQueue = result.then(
      () => {},
      () => {}
    );

    return result;
  }

  /**
   * Assess the trust level of an issuer
   *
   * @param issuerAddress The issuer's Midnight address
   * @param credentialType Optional credential type for type-specific trust
   * @returns Trust assessment with level and warnings
   */
  async assessTrust(
    issuerAddress: string,
    credentialType?: string
  ): Promise<IssuerTrustAssessment> {
    const warnings: string[] = [];

    // Check for missing/invalid address
    if (!issuerAddress || issuerAddress.trim() === '') {
      return {
        level: 'unknown',
        issuerAddress: issuerAddress || '',
        warnings: ['No issuer address provided'],
      };
    }

    // Check address format
    if (!isValidMidnightAddress(issuerAddress)) {
      warnings.push('Issuer address format is invalid');
      return {
        level: 'unknown',
        issuerAddress,
        warnings,
      };
    }

    // Check whitelist
    const trusted = await this.getWhitelistedIssuer(issuerAddress);
    if (trusted) {
      // Check credential type restriction if applicable
      if (
        credentialType &&
        trusted.credentialTypes &&
        trusted.credentialTypes.length > 0 &&
        !trusted.credentialTypes.includes(credentialType)
      ) {
        warnings.push(`Issuer is trusted but not for ${credentialType} credentials`);
        return {
          level: 'self-attested',
          issuerAddress,
          issuerName: trusted.name,
          warnings,
        };
      }

      return {
        level: 'whitelisted',
        issuerAddress,
        issuerName: trusted.name,
        warnings: [],
      };
    }

    // Valid address but not in whitelist
    warnings.push('Issuer is not in your trusted list');
    return {
      level: 'self-attested',
      issuerAddress,
      warnings,
    };
  }

  /**
   * Add an issuer to the whitelist
   */
  async addToWhitelist(issuer: Omit<TrustedIssuer, 'addedAt'>): Promise<void> {
    if (!isValidMidnightAddress(issuer.address)) {
      throw new Error('Invalid issuer address format');
    }

    return this.withLock(async () => {
      const issuers = await this.loadWhitelist();
      const existingIndex = issuers.findIndex((i) => i.address === issuer.address);

      const trustedIssuer: TrustedIssuer = {
        ...issuer,
        addedAt: Date.now(),
      };

      if (existingIndex >= 0) {
        // Update existing
        issuers[existingIndex] = trustedIssuer;
      } else {
        // Add new
        issuers.push(trustedIssuer);
      }

      await this.saveWhitelist(issuers);
      console.log(`[IssuerTrustStore] Added issuer ${issuer.name} to whitelist`);
    });
  }

  /**
   * Remove an issuer from the whitelist
   */
  async removeFromWhitelist(address: string): Promise<boolean> {
    return this.withLock(async () => {
      const issuers = await this.loadWhitelist();
      const originalLength = issuers.length;

      const filtered = issuers.filter((i) => i.address !== address);

      if (filtered.length < originalLength) {
        await this.saveWhitelist(filtered);
        console.log(`[IssuerTrustStore] Removed issuer ${address} from whitelist`);
        return true;
      }

      return false;
    });
  }

  /**
   * Get a specific whitelisted issuer by address
   */
  async getWhitelistedIssuer(address: string): Promise<TrustedIssuer | null> {
    const issuers = await this.loadWhitelist();
    return issuers.find((i) => i.address === address) || null;
  }

  /**
   * Get all whitelisted issuers
   */
  async getAllWhitelisted(): Promise<TrustedIssuer[]> {
    return this.loadWhitelist();
  }

  /**
   * Check if an issuer is whitelisted
   */
  async isWhitelisted(address: string): Promise<boolean> {
    const issuer = await this.getWhitelistedIssuer(address);
    return issuer !== null;
  }

  /**
   * Clear all whitelisted issuers (for testing or reset)
   */
  async clearWhitelist(): Promise<void> {
    return this.withLock(async () => {
      await this.saveWhitelist([]);
      console.log('[IssuerTrustStore] Cleared whitelist');
    });
  }

  /**
   * Load whitelist from chrome.storage.local
   */
  private async loadWhitelist(): Promise<TrustedIssuer[]> {
    const result = await chrome.storage.local.get([STORAGE_KEY]);
    return result[STORAGE_KEY] || [];
  }

  /**
   * Save whitelist to chrome.storage.local
   */
  private async saveWhitelist(issuers: TrustedIssuer[]): Promise<void> {
    await chrome.storage.local.set({ [STORAGE_KEY]: issuers });
  }
}

/**
 * Get UI properties for a trust level
 */
export function getTrustLevelUI(level: IssuerTrustLevel): {
  label: string;
  color: string;
  bgColor: string;
  description: string;
} {
  switch (level) {
    case 'verified':
      return {
        label: 'Verified',
        color: '#22c55e', // green-500
        bgColor: '#dcfce7', // green-100
        description: 'Issuer verified on-chain',
      };
    case 'whitelisted':
      return {
        label: 'Trusted',
        color: '#3b82f6', // blue-500
        bgColor: '#dbeafe', // blue-100
        description: 'Issuer in your trusted list',
      };
    case 'self-attested':
      return {
        label: 'Unverified',
        color: '#eab308', // yellow-500
        bgColor: '#fef9c3', // yellow-100
        description: 'Issuer not verified - proceed with caution',
      };
    case 'unknown':
      return {
        label: 'Unknown',
        color: '#ef4444', // red-500
        bgColor: '#fee2e2', // red-100
        description: 'Invalid or missing issuer - not recommended',
      };
  }
}
