/**
 * Utility functions for MaskID SDK
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
