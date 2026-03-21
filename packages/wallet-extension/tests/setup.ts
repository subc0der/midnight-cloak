/**
 * Test setup for wallet extension
 *
 * Provides mocks for Chrome extension APIs since tests run in jsdom, not a real extension.
 */

import { vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom';

// In-memory storage for chrome.storage.local mock
let mockStorage: Record<string, unknown> = {};

// Message handlers for chrome.runtime.sendMessage mock
let messageHandlers: Array<(message: unknown, sender: unknown, sendResponse: (response: unknown) => void) => boolean | void> = [];

// Mock chrome APIs
const chromeMock = {
  storage: {
    local: {
      get: vi.fn((keys: string | string[] | null) => {
        return new Promise((resolve) => {
          if (keys === null) {
            resolve({ ...mockStorage });
          } else if (typeof keys === 'string') {
            resolve({ [keys]: mockStorage[keys] });
          } else if (Array.isArray(keys)) {
            const result: Record<string, unknown> = {};
            keys.forEach((key) => {
              if (key in mockStorage) {
                result[key] = mockStorage[key];
              }
            });
            resolve(result);
          } else {
            resolve({});
          }
        });
      }),
      set: vi.fn((items: Record<string, unknown>) => {
        return new Promise<void>((resolve) => {
          Object.assign(mockStorage, items);
          resolve();
        });
      }),
      remove: vi.fn((keys: string | string[]) => {
        return new Promise<void>((resolve) => {
          if (typeof keys === 'string') {
            delete mockStorage[keys];
          } else {
            keys.forEach((key) => delete mockStorage[key]);
          }
          resolve();
        });
      }),
      clear: vi.fn(() => {
        return new Promise<void>((resolve) => {
          mockStorage = {};
          resolve();
        });
      }),
    },
  },
  runtime: {
    sendMessage: vi.fn((message: unknown) => {
      return new Promise((resolve) => {
        // Allow tests to set up custom handlers
        for (const handler of messageHandlers) {
          let responded = false;
          const sendResponse = (response: unknown) => {
            responded = true;
            resolve(response);
          };
          const result = handler(message, {}, sendResponse);
          if (result === true || responded) {
            return;
          }
        }
        // Default: resolve with undefined
        resolve(undefined);
      });
    }),
    onMessage: {
      addListener: vi.fn((handler) => {
        messageHandlers.push(handler);
      }),
      removeListener: vi.fn((handler) => {
        messageHandlers = messageHandlers.filter((h) => h !== handler);
      }),
    },
    getContexts: vi.fn(() => Promise.resolve([])),
    ContextType: {
      OFFSCREEN_DOCUMENT: 'OFFSCREEN_DOCUMENT',
    },
  },
  offscreen: {
    createDocument: vi.fn(() => Promise.resolve()),
    Reason: {
      DOM_PARSER: 'DOM_PARSER',
    },
  },
};

// Assign to global
// @ts-expect-error - Chrome types not available in test environment
globalThis.chrome = chromeMock;

// Reset mocks before each test
beforeEach(() => {
  mockStorage = {};
  messageHandlers = [];
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Storage failure simulation
let storageFailure: 'get' | 'set' | 'all' | null = null;

// Export helpers for tests
export function getMockStorage(): Record<string, unknown> {
  return mockStorage;
}

export function setMockStorage(data: Record<string, unknown>): void {
  mockStorage = { ...data };
}

export function addMessageHandler(
  handler: (message: unknown, sender: unknown, sendResponse: (response: unknown) => void) => boolean | void
): void {
  messageHandlers.push(handler);
}

export function clearMessageHandlers(): void {
  messageHandlers = [];
}

/**
 * Simulate storage failures for testing fail-closed behavior
 * @param type - 'get' | 'set' | 'all' | null (null to disable)
 */
export function simulateStorageFailure(type: 'get' | 'set' | 'all' | null): void {
  storageFailure = type;

  // Update mock implementations to throw when failure is simulated
  if (type === 'get' || type === 'all') {
    chromeMock.storage.local.get.mockImplementation(() => {
      return Promise.reject(new Error('Storage unavailable'));
    });
  } else {
    // Restore normal get behavior
    chromeMock.storage.local.get.mockImplementation((keys: string | string[] | null) => {
      return new Promise((resolve) => {
        if (keys === null) {
          resolve({ ...mockStorage });
        } else if (typeof keys === 'string') {
          resolve({ [keys]: mockStorage[keys] });
        } else if (Array.isArray(keys)) {
          const result: Record<string, unknown> = {};
          keys.forEach((key) => {
            if (key in mockStorage) {
              result[key] = mockStorage[key];
            }
          });
          resolve(result);
        } else {
          resolve({});
        }
      });
    });
  }

  if (type === 'set' || type === 'all') {
    chromeMock.storage.local.set.mockImplementation(() => {
      return Promise.reject(new Error('Storage unavailable'));
    });
  } else {
    // Restore normal set behavior
    chromeMock.storage.local.set.mockImplementation((items: Record<string, unknown>) => {
      return new Promise<void>((resolve) => {
        Object.assign(mockStorage, items);
        resolve();
      });
    });
  }
}

export { chromeMock, storageFailure };
