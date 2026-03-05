/**
 * Utility functions for Midnight Cloak SDK
 */

/**
 * Generate a unique request ID
 */
export function generateRequestId(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 10);
  return `req_${timestamp}_${randomPart}`;
}

/**
 * Get current date components
 */
export function getCurrentDate(): { year: number; month: number; day: number } {
  const now = new Date();
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
  };
}

/**
 * Calculate age from birth date
 */
export function calculateAge(birthYear: number, birthMonth: number, birthDay: number): number {
  const { year, month, day } = getCurrentDate();
  let age = year - birthYear;

  if (month < birthMonth || (month === birthMonth && day < birthDay)) {
    age -= 1;
  }

  return age;
}

/**
 * Delay execution for specified milliseconds
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Timeout error thrown when an operation exceeds the time limit
 */
export class TimeoutError extends Error {
  constructor(message: string, public readonly timeoutMs: number) {
    super(message);
    this.name = 'TimeoutError';
  }
}

/**
 * Wrap a promise with a timeout.
 * If the promise doesn't resolve within the specified time, rejects with TimeoutError.
 *
 * @param promise - The promise to wrap
 * @param timeoutMs - Timeout in milliseconds
 * @param errorMessage - Optional custom error message (default: "Operation timed out")
 * @returns The result of the promise if it resolves in time
 * @throws TimeoutError if the timeout is exceeded
 *
 * @example
 * ```typescript
 * const result = await withTimeout(
 *   fetchData(),
 *   5000,
 *   'Data fetch timed out'
 * );
 * ```
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage?: string
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    const timer = setTimeout(() => {
      reject(new TimeoutError(
        errorMessage ?? `Operation timed out after ${timeoutMs}ms`,
        timeoutMs
      ));
    }, timeoutMs);

    // Clean up timer if promise settles first (avoid memory leak in long-running processes)
    promise.finally(() => clearTimeout(timer));
  });

  return Promise.race([promise, timeoutPromise]);
}
