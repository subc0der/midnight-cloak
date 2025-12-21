/**
 * RequestHandler - Handle incoming verification requests
 */

import type { VerificationRequest, Proof } from '@maskid/core';

export interface VerificationResponse {
  approved: boolean;
  proof?: Proof;
}

type RequestCallback = (request: VerificationRequest) => Promise<VerificationResponse>;

export class RequestHandler {
  private callback?: RequestCallback;

  onRequest(callback: RequestCallback): void {
    this.callback = callback;
  }

  async handleRequest(request: VerificationRequest): Promise<VerificationResponse> {
    if (!this.callback) {
      return { approved: false };
    }

    return this.callback(request);
  }

  removeHandler(): void {
    this.callback = undefined;
  }
}
