/**
 * Activity Log Storage for Midnight Cloak Extension
 *
 * Tracks user interactions with dApps for audit/transparency purposes.
 * Stores only metadata - no sensitive claims, proof data, or credential IDs.
 *
 * Design:
 * - Uses chrome.storage.local for persistence
 * - Singleton pattern with mutex lock for thread safety
 * - Auto-prunes oldest entries when over MAX_ENTRIES limit
 * - Privacy-conscious: only logs metadata, not sensitive data
 */

// Storage key for activity log data
const STORAGE_KEY = 'activityLog';

// Maximum number of entries to retain (FIFO pruning)
const MAX_ENTRIES = 100;

/**
 * Activity event types
 */
export type ActivityEventType =
  | 'verification_request'
  | 'approval'
  | 'denial'
  | 'credential_offer'
  | 'credential_accepted'
  | 'credential_rejected';

/**
 * Single activity entry - privacy-conscious metadata only
 */
export interface ActivityEntry {
  id: string;
  type: ActivityEventType;
  origin: string;
  credentialType: string;
  timestamp: number;
  metadata?: {
    requestId?: string;
    minAge?: number;
    policyType?: string;
  };
}

/**
 * Full activity log data structure stored in chrome.storage.local
 */
export interface ActivityLogData {
  entries: ActivityEntry[];
  lastPruned: number;
}

/**
 * Empty activity log structure
 */
function emptyActivityLog(): ActivityLogData {
  return {
    entries: [],
    lastPruned: Date.now(),
  };
}

/**
 * Activity Log Store using chrome.storage.local
 *
 * Singleton pattern matching RequestQueue for consistency.
 * Uses mutex lock to prevent race conditions.
 */
export class ActivityLogStore {
  private static instance: ActivityLogStore | null = null;

  /**
   * Mutex lock to serialize storage operations.
   * Prevents race conditions when multiple events occur simultaneously.
   */
  private operationQueue: Promise<void> = Promise.resolve();

  /**
   * Get the singleton instance
   */
  static getInstance(): ActivityLogStore {
    if (!ActivityLogStore.instance) {
      ActivityLogStore.instance = new ActivityLogStore();
    }
    return ActivityLogStore.instance;
  }

  /**
   * Reset the singleton (for testing)
   */
  static resetInstance(): void {
    ActivityLogStore.instance = null;
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

  // ─────────────────────────────────────────────────────────────────────────
  // Entry Operations
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Add an activity entry to the log
   *
   * Auto-generates UUID and timestamp.
   * Auto-prunes oldest entries if over MAX_ENTRIES.
   */
  async addEntry(entry: Omit<ActivityEntry, 'id' | 'timestamp'>): Promise<string> {
    return this.withLock(async () => {
      const data = await this.load();

      const newEntry: ActivityEntry = {
        ...entry,
        id: crypto.randomUUID(),
        timestamp: Date.now(),
      };

      data.entries.push(newEntry);

      // Auto-prune if over limit (keep newest)
      if (data.entries.length > MAX_ENTRIES) {
        // Sort by timestamp descending and keep only MAX_ENTRIES
        data.entries.sort((a, b) => b.timestamp - a.timestamp);
        data.entries = data.entries.slice(0, MAX_ENTRIES);
        data.lastPruned = Date.now();
        console.log(`[ActivityLog] Pruned to ${MAX_ENTRIES} entries`);
      }

      await this.save(data);
      console.log(`[ActivityLog] Added ${entry.type} from ${entry.origin}`);

      return newEntry.id;
    });
  }

  /**
   * Get all activity entries sorted by timestamp (newest first)
   */
  async getAll(): Promise<ActivityEntry[]> {
    const data = await this.load();
    return [...data.entries].sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Get entries filtered by event type
   */
  async getByType(type: ActivityEventType): Promise<ActivityEntry[]> {
    const data = await this.load();
    return data.entries
      .filter((e) => e.type === type)
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Get entries filtered by origin
   */
  async getByOrigin(origin: string): Promise<ActivityEntry[]> {
    const data = await this.load();
    return data.entries
      .filter((e) => e.origin === origin)
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Get count of entries by type (for potential badges/stats)
   */
  async getCounts(): Promise<Record<ActivityEventType, number>> {
    const data = await this.load();
    const counts: Record<ActivityEventType, number> = {
      verification_request: 0,
      approval: 0,
      denial: 0,
      credential_offer: 0,
      credential_accepted: 0,
      credential_rejected: 0,
    };

    for (const entry of data.entries) {
      counts[entry.type]++;
    }

    return counts;
  }

  /**
   * Clear all activity entries
   */
  async clear(): Promise<void> {
    return this.withLock(async () => {
      await this.save(emptyActivityLog());
      console.log('[ActivityLog] Cleared all entries');
    });
  }

  /**
   * Get total entry count
   */
  async getCount(): Promise<number> {
    const data = await this.load();
    return data.entries.length;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Storage Operations
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Load activity log data from chrome.storage.local
   */
  private async load(): Promise<ActivityLogData> {
    const result = await chrome.storage.local.get([STORAGE_KEY]);
    const stored = result[STORAGE_KEY];

    // Validate stored data has expected shape
    if (stored && typeof stored === 'object' && 'entries' in stored && Array.isArray(stored.entries)) {
      return stored as ActivityLogData;
    }

    return emptyActivityLog();
  }

  /**
   * Save activity log data to chrome.storage.local
   */
  private async save(data: ActivityLogData): Promise<void> {
    await chrome.storage.local.set({ [STORAGE_KEY]: data });
  }
}
