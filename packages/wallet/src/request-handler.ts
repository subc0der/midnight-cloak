/**
 * RequestHandler - Handle incoming verification requests
 */

import type { VerificationRequest, Proof } from '@midnight-cloak/core';

/** Error thrown when request handling fails */
export class RequestHandlerError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'RequestHandlerError';
  }
}

export interface VerificationResponse {
  approved: boolean;
  proof?: Proof;
  /** Error message if not approved */
  error?: string;
}

export interface RequestHandlerConfig {
  /** Timeout in milliseconds for request handling (default: 120000 = 2 minutes) */
  timeout?: number;
}

type RequestCallback = (request: VerificationRequest) => Promise<VerificationResponse>;

/**
 * Validate that a request has the basic required structure.
 */
function validateRequest(request: unknown): string[] | null {
  const errors: string[] = [];

  if (!request || typeof request !== 'object') {
    return ['Request must be an object'];
  }

  const req = request as Record<string, unknown>;

  // Check for SimpleVerificationRequest structure
  const hasType = typeof req.type === 'string';
  const hasPolicy = req.policy && typeof req.policy === 'object';

  // Check for CustomPolicyRequest structure
  const hasCustomPolicy = req.customPolicy && typeof req.customPolicy === 'object';

  if (!hasType && !hasCustomPolicy) {
    errors.push('Request must have either type+policy or customPolicy');
  }

  if (hasType && !hasPolicy) {
    errors.push('Request with type must also have policy');
  }

  return errors.length > 0 ? errors : null;
}

/**
 * Create a timeout promise that rejects after the specified duration.
 */
function createTimeout(ms: number): { promise: Promise<never>; cancel: () => void } {
  let timeoutId: ReturnType<typeof setTimeout>;

  const promise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new RequestHandlerError(
        `Request timed out after ${ms}ms`,
        'REQUEST_TIMEOUT'
      ));
    }, ms);
  });

  const cancel = () => {
    clearTimeout(timeoutId);
  };

  return { promise, cancel };
}

export class RequestHandler {
  private callback?: RequestCallback;
  private readonly timeout: number;

  constructor(config: RequestHandlerConfig = {}) {
    this.timeout = config.timeout ?? 120000; // 2 minutes default
  }

  /**
   * Register a callback to handle verification requests.
   * Note: Only one handler can be registered at a time.
   * Registering a new handler will replace the existing one.
   *
   * @param callback - Function to call when a verification request is received
   * @returns Function to unregister the handler
   */
  onRequest(callback: RequestCallback): () => void {
    this.callback = callback;
    return () => this.removeHandler();
  }

  /**
   * Handle an incoming verification request.
   *
   * @param request - The verification request to handle
   * @returns The verification response
   * @throws {RequestHandlerError} If no handler is registered, validation fails, or timeout occurs
   */
  async handleRequest(request: VerificationRequest): Promise<VerificationResponse> {
    // Validate request structure
    const errors = validateRequest(request);
    if (errors) {
      throw new RequestHandlerError(
        `Invalid request: ${errors.join(', ')}`,
        'INVALID_REQUEST'
      );
    }

    if (!this.callback) {
      throw new RequestHandlerError(
        'No request handler registered',
        'NO_HANDLER'
      );
    }

    // Execute callback with timeout
    const { promise: timeoutPromise, cancel: cancelTimeout } = createTimeout(this.timeout);

    try {
      const result = await Promise.race([
        this.callback(request),
        timeoutPromise,
      ]);
      return result;
    } finally {
      cancelTimeout();
    }
  }

  /**
   * Check if a handler is registered.
   */
  hasHandler(): boolean {
    return this.callback !== undefined;
  }

  /**
   * Remove the current request handler.
   */
  removeHandler(): void {
    this.callback = undefined;
  }
}
