/**
 * Tests for VerificationRequest component
 *
 * Tests the verification approval/denial flow, credential matching, and UI states.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import VerificationRequest from '../../src/popup/pages/VerificationRequest';
import { addMessageHandler, clearMessageHandlers } from '../setup';
import type { PersistedVerificationRequest } from '../../src/shared/storage/request-queue';

// Helper to create a mock verification request
function createMockRequest(
  overrides: Partial<PersistedVerificationRequest> = {}
): PersistedVerificationRequest {
  return {
    id: 'test-request-1',
    origin: 'https://example.com',
    policyConfig: {
      type: 'AGE',
      policy: { minAge: 18 },
    },
    timestamp: Date.now(),
    expiresAt: Date.now() + 300000, // 5 minutes from now
    ...overrides,
  };
}

// Helper to create a mock credential
function createMockCredential(
  type: string,
  options: { expired?: boolean; claims?: Record<string, unknown> } = {}
) {
  const { expired = false, claims = {} } = options;
  return {
    id: `cred-${type.toLowerCase()}`,
    type,
    issuer: 'a'.repeat(64),
    subject: 'b'.repeat(64),
    claims,
    issuedAt: Date.now() - 86400000, // 1 day ago
    expiresAt: expired ? Date.now() - 1000 : Date.now() + 86400000, // expired or 1 day from now
    signature: new Uint8Array([1, 2, 3]),
  };
}

describe('VerificationRequest', () => {
  const mockOnComplete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    clearMessageHandlers();
  });

  describe('loading state', () => {
    it('shows spinner while loading', async () => {
      // Don't respond immediately
      addMessageHandler(() => {
        // Don't call sendResponse
        return false;
      });

      render(<VerificationRequest onComplete={mockOnComplete} />);

      expect(screen.getByClassName || document.querySelector('.spinner')).toBeTruthy();
    });
  });

  describe('empty state', () => {
    it('calls onComplete when no pending requests', async () => {
      addMessageHandler((message, _sender, sendResponse) => {
        const msg = message as { type: string };
        if (msg.type === 'GET_ALL_PENDING_REQUESTS') {
          sendResponse({ success: true, requests: [] });
          return true;
        }
      });

      render(<VerificationRequest onComplete={mockOnComplete} />);

      await waitFor(() => {
        expect(mockOnComplete).toHaveBeenCalled();
      });
    });

    it('calls onComplete when request fetch fails with empty array', async () => {
      addMessageHandler((message, _sender, sendResponse) => {
        const msg = message as { type: string };
        if (msg.type === 'GET_ALL_PENDING_REQUESTS') {
          sendResponse({ success: false });
          return true;
        }
      });

      render(<VerificationRequest onComplete={mockOnComplete} />);

      await waitFor(() => {
        expect(mockOnComplete).toHaveBeenCalled();
      });
    });
  });

  describe('request display', () => {
    beforeEach(() => {
      addMessageHandler((message, _sender, sendResponse) => {
        const msg = message as { type: string };
        if (msg.type === 'GET_ALL_PENDING_REQUESTS') {
          sendResponse({
            success: true,
            requests: [createMockRequest()],
          });
          return true;
        }
        if (msg.type === 'GET_CREDENTIALS') {
          sendResponse({ success: true, credentials: [] });
          return true;
        }
      });
    });

    it('shows verification request header', async () => {
      render(<VerificationRequest onComplete={mockOnComplete} />);

      await waitFor(() => {
        expect(screen.getByText('Verification Request')).toBeInTheDocument();
      });
    });

    it('shows origin of the request', async () => {
      render(<VerificationRequest onComplete={mockOnComplete} />);

      await waitFor(() => {
        expect(screen.getByText('https://example.com')).toBeInTheDocument();
      });
    });

    it('shows verification type', async () => {
      render(<VerificationRequest onComplete={mockOnComplete} />);

      await waitFor(() => {
        expect(screen.getByText('AGE Verification')).toBeInTheDocument();
      });
    });

    it('shows age verification description', async () => {
      render(<VerificationRequest onComplete={mockOnComplete} />);

      await waitFor(() => {
        expect(screen.getByText('Prove you are 18+')).toBeInTheDocument();
      });
    });
  });

  describe('verification descriptions', () => {
    it('shows TOKEN_BALANCE description', async () => {
      addMessageHandler((message, _sender, sendResponse) => {
        const msg = message as { type: string };
        if (msg.type === 'GET_ALL_PENDING_REQUESTS') {
          sendResponse({
            success: true,
            requests: [
              createMockRequest({
                policyConfig: {
                  type: 'TOKEN_BALANCE',
                  policy: { minBalance: 1000, token: 'ADA' },
                },
              }),
            ],
          });
          return true;
        }
        if (msg.type === 'GET_CREDENTIALS') {
          sendResponse({ success: true, credentials: [] });
          return true;
        }
      });

      render(<VerificationRequest onComplete={mockOnComplete} />);

      await waitFor(() => {
        expect(screen.getByText('Prove you hold 1000 ADA')).toBeInTheDocument();
      });
    });

    it('shows NFT_OWNERSHIP description', async () => {
      addMessageHandler((message, _sender, sendResponse) => {
        const msg = message as { type: string };
        if (msg.type === 'GET_ALL_PENDING_REQUESTS') {
          sendResponse({
            success: true,
            requests: [
              createMockRequest({
                policyConfig: {
                  type: 'NFT_OWNERSHIP',
                  policy: { collection: 'CryptoPunks' },
                },
              }),
            ],
          });
          return true;
        }
        if (msg.type === 'GET_CREDENTIALS') {
          sendResponse({ success: true, credentials: [] });
          return true;
        }
      });

      render(<VerificationRequest onComplete={mockOnComplete} />);

      await waitFor(() => {
        expect(screen.getByText('Prove you own CryptoPunks')).toBeInTheDocument();
      });
    });

    it('shows ACCREDITED description', async () => {
      addMessageHandler((message, _sender, sendResponse) => {
        const msg = message as { type: string };
        if (msg.type === 'GET_ALL_PENDING_REQUESTS') {
          sendResponse({
            success: true,
            requests: [
              createMockRequest({
                policyConfig: { type: 'ACCREDITED' },
              }),
            ],
          });
          return true;
        }
        if (msg.type === 'GET_CREDENTIALS') {
          sendResponse({ success: true, credentials: [] });
          return true;
        }
      });

      render(<VerificationRequest onComplete={mockOnComplete} />);

      await waitFor(() => {
        expect(screen.getByText('Prove accredited investor status')).toBeInTheDocument();
      });
    });

    it('shows RESIDENCY description', async () => {
      addMessageHandler((message, _sender, sendResponse) => {
        const msg = message as { type: string };
        if (msg.type === 'GET_ALL_PENDING_REQUESTS') {
          sendResponse({
            success: true,
            requests: [
              createMockRequest({
                policyConfig: {
                  type: 'RESIDENCY',
                  policy: { region: 'US' },
                },
              }),
            ],
          });
          return true;
        }
        if (msg.type === 'GET_CREDENTIALS') {
          sendResponse({ success: true, credentials: [] });
          return true;
        }
      });

      render(<VerificationRequest onComplete={mockOnComplete} />);

      await waitFor(() => {
        expect(screen.getByText('Prove residency in US')).toBeInTheDocument();
      });
    });
  });

  describe('credential matching', () => {
    it('shows matching credential when found', async () => {
      addMessageHandler((message, _sender, sendResponse) => {
        const msg = message as { type: string };
        if (msg.type === 'GET_ALL_PENDING_REQUESTS') {
          sendResponse({
            success: true,
            requests: [createMockRequest()], // Requires minAge 18
          });
          return true;
        }
        if (msg.type === 'GET_CREDENTIALS') {
          sendResponse({
            success: true,
            // User born in 1990 is 36+ years old (in 2026), exceeds minAge 18
            credentials: [createMockCredential('AGE', { claims: { birthDate: '1990-01-01' } })],
          });
          return true;
        }
      });

      render(<VerificationRequest onComplete={mockOnComplete} />);

      await waitFor(() => {
        expect(screen.getByText('Using credential:')).toBeInTheDocument();
      });
    });

    it('shows warning when no matching credential', async () => {
      addMessageHandler((message, _sender, sendResponse) => {
        const msg = message as { type: string };
        if (msg.type === 'GET_ALL_PENDING_REQUESTS') {
          sendResponse({
            success: true,
            requests: [createMockRequest()],
          });
          return true;
        }
        if (msg.type === 'GET_CREDENTIALS') {
          sendResponse({ success: true, credentials: [] });
          return true;
        }
      });

      render(<VerificationRequest onComplete={mockOnComplete} />);

      await waitFor(() => {
        expect(screen.getByText(/No matching credential found/)).toBeInTheDocument();
      });
    });

    it('does not match expired credentials', async () => {
      addMessageHandler((message, _sender, sendResponse) => {
        const msg = message as { type: string };
        if (msg.type === 'GET_ALL_PENDING_REQUESTS') {
          sendResponse({
            success: true,
            requests: [createMockRequest()],
          });
          return true;
        }
        if (msg.type === 'GET_CREDENTIALS') {
          sendResponse({
            success: true,
            credentials: [createMockCredential('AGE', { expired: true, claims: { birthDate: '1990-01-01' } })],
          });
          return true;
        }
      });

      render(<VerificationRequest onComplete={mockOnComplete} />);

      await waitFor(() => {
        expect(screen.getByText(/No matching credential found/)).toBeInTheDocument();
      });
    });

    it('does not match wrong credential type', async () => {
      addMessageHandler((message, _sender, sendResponse) => {
        const msg = message as { type: string };
        if (msg.type === 'GET_ALL_PENDING_REQUESTS') {
          sendResponse({
            success: true,
            requests: [createMockRequest()], // AGE type
          });
          return true;
        }
        if (msg.type === 'GET_CREDENTIALS') {
          sendResponse({
            success: true,
            credentials: [createMockCredential('TOKEN_BALANCE')], // wrong type
          });
          return true;
        }
      });

      render(<VerificationRequest onComplete={mockOnComplete} />);

      await waitFor(() => {
        expect(screen.getByText(/No matching credential found/)).toBeInTheDocument();
      });
    });

    it('validates age credential meets minAge policy requirement', async () => {
      // Request requires age 21+, credential proves user is 20 (born 2006)
      addMessageHandler((message, _sender, sendResponse) => {
        const msg = message as { type: string };
        if (msg.type === 'GET_ALL_PENDING_REQUESTS') {
          sendResponse({
            success: true,
            requests: [
              createMockRequest({
                policyConfig: { type: 'AGE', policy: { minAge: 21 } },
              }),
            ],
          });
          return true;
        }
        if (msg.type === 'GET_CREDENTIALS') {
          sendResponse({
            success: true,
            // User born in 2006 is only ~20 years old (in 2026)
            credentials: [createMockCredential('AGE', { claims: { birthDate: '2006-01-01' } })],
          });
          return true;
        }
      });

      render(<VerificationRequest onComplete={mockOnComplete} />);

      await waitFor(() => {
        // Should NOT match - credential proves age but doesn't meet minAge requirement
        expect(screen.getByText(/No matching credential found/)).toBeInTheDocument();
      });
    });

    it('matches age credential that meets minAge policy requirement', async () => {
      // Request requires age 18+, credential proves user is 30+ (born 1990)
      addMessageHandler((message, _sender, sendResponse) => {
        const msg = message as { type: string };
        if (msg.type === 'GET_ALL_PENDING_REQUESTS') {
          sendResponse({
            success: true,
            requests: [
              createMockRequest({
                policyConfig: { type: 'AGE', policy: { minAge: 18 } },
              }),
            ],
          });
          return true;
        }
        if (msg.type === 'GET_CREDENTIALS') {
          sendResponse({
            success: true,
            // User born in 1990 is ~36 years old (in 2026)
            credentials: [createMockCredential('AGE', { claims: { birthDate: '1990-01-01' } })],
          });
          return true;
        }
      });

      render(<VerificationRequest onComplete={mockOnComplete} />);

      await waitFor(() => {
        // Should match - credential proves sufficient age
        expect(screen.getByText('Using credential:')).toBeInTheDocument();
      });
    });

    it('validates token balance credential meets minimum balance', async () => {
      // Request requires 1000 ADA, credential only has 500 ADA
      addMessageHandler((message, _sender, sendResponse) => {
        const msg = message as { type: string };
        if (msg.type === 'GET_ALL_PENDING_REQUESTS') {
          sendResponse({
            success: true,
            requests: [
              createMockRequest({
                policyConfig: {
                  type: 'TOKEN_BALANCE',
                  policy: { token: 'ADA', minBalance: 1000 },
                },
              }),
            ],
          });
          return true;
        }
        if (msg.type === 'GET_CREDENTIALS') {
          sendResponse({
            success: true,
            credentials: [
              createMockCredential('TOKEN_BALANCE', {
                claims: { token: 'ADA', balance: 500 },
              }),
            ],
          });
          return true;
        }
      });

      render(<VerificationRequest onComplete={mockOnComplete} />);

      await waitFor(() => {
        // Should NOT match - insufficient balance
        expect(screen.getByText(/No matching credential found/)).toBeInTheDocument();
      });
    });

    it('matches token balance credential with sufficient balance', async () => {
      // Request requires 1000 ADA, credential has 2000 ADA
      addMessageHandler((message, _sender, sendResponse) => {
        const msg = message as { type: string };
        if (msg.type === 'GET_ALL_PENDING_REQUESTS') {
          sendResponse({
            success: true,
            requests: [
              createMockRequest({
                policyConfig: {
                  type: 'TOKEN_BALANCE',
                  policy: { token: 'ADA', minBalance: 1000 },
                },
              }),
            ],
          });
          return true;
        }
        if (msg.type === 'GET_CREDENTIALS') {
          sendResponse({
            success: true,
            credentials: [
              createMockCredential('TOKEN_BALANCE', {
                claims: { token: 'ADA', balance: 2000 },
              }),
            ],
          });
          return true;
        }
      });

      render(<VerificationRequest onComplete={mockOnComplete} />);

      await waitFor(() => {
        // Should match - sufficient balance
        expect(screen.getByText('Using credential:')).toBeInTheDocument();
      });
    });
  });

  describe('approve button state', () => {
    it('disables approve button when no matching credential', async () => {
      addMessageHandler((message, _sender, sendResponse) => {
        const msg = message as { type: string };
        if (msg.type === 'GET_ALL_PENDING_REQUESTS') {
          sendResponse({
            success: true,
            requests: [createMockRequest()],
          });
          return true;
        }
        if (msg.type === 'GET_CREDENTIALS') {
          sendResponse({ success: true, credentials: [] });
          return true;
        }
      });

      render(<VerificationRequest onComplete={mockOnComplete} />);

      await waitFor(() => {
        const approveBtn = screen.getByRole('button', { name: 'Approve' });
        expect(approveBtn).toBeDisabled();
      });
    });

    it('enables approve button when matching credential exists', async () => {
      addMessageHandler((message, _sender, sendResponse) => {
        const msg = message as { type: string };
        if (msg.type === 'GET_ALL_PENDING_REQUESTS') {
          sendResponse({
            success: true,
            requests: [createMockRequest()], // Requires minAge 18
          });
          return true;
        }
        if (msg.type === 'GET_CREDENTIALS') {
          sendResponse({
            success: true,
            credentials: [createMockCredential('AGE', { claims: { birthDate: '1990-01-01' } })],
          });
          return true;
        }
      });

      render(<VerificationRequest onComplete={mockOnComplete} />);

      await waitFor(() => {
        const approveBtn = screen.getByRole('button', { name: 'Approve' });
        expect(approveBtn).not.toBeDisabled();
      });
    });
  });

  describe('approve flow', () => {
    it('approves verification and checks for more requests', async () => {
      let approveCallCount = 0;
      let getAllCallCount = 0;

      addMessageHandler((message, _sender, sendResponse) => {
        const msg = message as { type: string; requestId?: string };

        if (msg.type === 'GET_ALL_PENDING_REQUESTS') {
          getAllCallCount++;
          if (getAllCallCount === 1) {
            // First call: return a request
            sendResponse({
              success: true,
              requests: [createMockRequest()],
            });
          } else {
            // After approval: no more requests
            sendResponse({ success: true, requests: [] });
          }
          return true;
        }
        if (msg.type === 'GET_CREDENTIALS') {
          sendResponse({
            success: true,
            credentials: [createMockCredential('AGE', { claims: { birthDate: '1990-01-01' } })],
          });
          return true;
        }
        if (msg.type === 'APPROVE_VERIFICATION') {
          approveCallCount++;
          expect(msg.requestId).toBe('test-request-1');
          sendResponse({ success: true });
          return true;
        }
      });

      render(<VerificationRequest onComplete={mockOnComplete} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Approve' })).not.toBeDisabled();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Approve' }));

      await waitFor(() => {
        expect(approveCallCount).toBe(1);
        expect(mockOnComplete).toHaveBeenCalled();
      });
    });

    it('shows error on approval failure', async () => {
      addMessageHandler((message, _sender, sendResponse) => {
        const msg = message as { type: string };
        if (msg.type === 'GET_ALL_PENDING_REQUESTS') {
          sendResponse({
            success: true,
            requests: [createMockRequest()],
          });
          return true;
        }
        if (msg.type === 'GET_CREDENTIALS') {
          sendResponse({
            success: true,
            credentials: [createMockCredential('AGE', { claims: { birthDate: '1990-01-01' } })],
          });
          return true;
        }
        if (msg.type === 'APPROVE_VERIFICATION') {
          sendResponse({ success: false, error: 'Proof generation failed' });
          return true;
        }
      });

      render(<VerificationRequest onComplete={mockOnComplete} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Approve' })).not.toBeDisabled();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Approve' }));

      await waitFor(() => {
        expect(screen.getByText('Proof generation failed')).toBeInTheDocument();
      });
    });

    it('shows processing state during approval', async () => {
      let resolveApprove: (value: unknown) => void;
      const approvePromise = new Promise((resolve) => {
        resolveApprove = resolve;
      });

      addMessageHandler((message, _sender, sendResponse) => {
        const msg = message as { type: string };
        if (msg.type === 'GET_ALL_PENDING_REQUESTS') {
          sendResponse({
            success: true,
            requests: [createMockRequest()],
          });
          return true;
        }
        if (msg.type === 'GET_CREDENTIALS') {
          sendResponse({
            success: true,
            credentials: [createMockCredential('AGE', { claims: { birthDate: '1990-01-01' } })],
          });
          return true;
        }
        if (msg.type === 'APPROVE_VERIFICATION') {
          // Don't respond immediately
          approvePromise.then(() => sendResponse({ success: true }));
          return true;
        }
      });

      render(<VerificationRequest onComplete={mockOnComplete} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Approve' })).not.toBeDisabled();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Approve' }));

      await waitFor(() => {
        expect(screen.getByText('Processing...')).toBeInTheDocument();
      });

      // Buttons should be disabled during processing
      expect(screen.getByRole('button', { name: 'Deny' })).toBeDisabled();

      // Resolve the promise
      resolveApprove!({ success: true });
    });
  });

  describe('deny flow', () => {
    it('denies verification and checks for more requests', async () => {
      let denyCallCount = 0;
      let getAllCallCount = 0;

      addMessageHandler((message, _sender, sendResponse) => {
        const msg = message as { type: string; requestId?: string };

        if (msg.type === 'GET_ALL_PENDING_REQUESTS') {
          getAllCallCount++;
          if (getAllCallCount === 1) {
            sendResponse({
              success: true,
              requests: [createMockRequest()],
            });
          } else {
            sendResponse({ success: true, requests: [] });
          }
          return true;
        }
        if (msg.type === 'GET_CREDENTIALS') {
          sendResponse({ success: true, credentials: [] });
          return true;
        }
        if (msg.type === 'DENY_VERIFICATION') {
          denyCallCount++;
          expect(msg.requestId).toBe('test-request-1');
          sendResponse({ success: true });
          return true;
        }
      });

      render(<VerificationRequest onComplete={mockOnComplete} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Deny' })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Deny' }));

      await waitFor(() => {
        expect(denyCallCount).toBe(1);
        expect(mockOnComplete).toHaveBeenCalled();
      });
    });

    it('handles deny via close button', async () => {
      let denyCallCount = 0;

      addMessageHandler((message, _sender, sendResponse) => {
        const msg = message as { type: string };
        if (msg.type === 'GET_ALL_PENDING_REQUESTS') {
          sendResponse({
            success: true,
            requests: [createMockRequest()],
          });
          return true;
        }
        if (msg.type === 'GET_CREDENTIALS') {
          sendResponse({ success: true, credentials: [] });
          return true;
        }
        if (msg.type === 'DENY_VERIFICATION') {
          denyCallCount++;
          sendResponse({ success: true });
          return true;
        }
      });

      render(<VerificationRequest onComplete={mockOnComplete} />);

      await waitFor(() => {
        expect(screen.getByTitle('Close')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTitle('Close'));

      await waitFor(() => {
        expect(denyCallCount).toBe(1);
      });
    });
  });

  describe('multiple pending requests', () => {
    it('shows pending count badge when multiple requests', async () => {
      addMessageHandler((message, _sender, sendResponse) => {
        const msg = message as { type: string };
        if (msg.type === 'GET_ALL_PENDING_REQUESTS') {
          sendResponse({
            success: true,
            requests: [
              createMockRequest({ id: 'req-1' }),
              createMockRequest({ id: 'req-2' }),
              createMockRequest({ id: 'req-3' }),
            ],
          });
          return true;
        }
        if (msg.type === 'GET_CREDENTIALS') {
          sendResponse({ success: true, credentials: [] });
          return true;
        }
      });

      render(<VerificationRequest onComplete={mockOnComplete} />);

      await waitFor(() => {
        expect(screen.getByText('3')).toBeInTheDocument();
      });
    });

    it('does not show badge when single request', async () => {
      addMessageHandler((message, _sender, sendResponse) => {
        const msg = message as { type: string };
        if (msg.type === 'GET_ALL_PENDING_REQUESTS') {
          sendResponse({
            success: true,
            requests: [createMockRequest()],
          });
          return true;
        }
        if (msg.type === 'GET_CREDENTIALS') {
          sendResponse({ success: true, credentials: [] });
          return true;
        }
      });

      render(<VerificationRequest onComplete={mockOnComplete} />);

      await waitFor(() => {
        expect(screen.getByText('Verification Request')).toBeInTheDocument();
      });

      // Should not have a badge
      expect(screen.queryByClassName || document.querySelector('.pending-badge')).toBeNull();
    });

    it('processes requests in order (oldest first)', async () => {
      const processedIds: string[] = [];
      let getAllCallCount = 0;

      const requests = [
        createMockRequest({ id: 'oldest', timestamp: 1000 }),
        createMockRequest({ id: 'middle', timestamp: 2000 }),
        createMockRequest({ id: 'newest', timestamp: 3000 }),
      ];

      addMessageHandler((message, _sender, sendResponse) => {
        const msg = message as { type: string; requestId?: string };

        if (msg.type === 'GET_ALL_PENDING_REQUESTS') {
          getAllCallCount++;
          if (getAllCallCount === 1) {
            sendResponse({ success: true, requests });
          } else {
            sendResponse({ success: true, requests: [] });
          }
          return true;
        }
        if (msg.type === 'GET_CREDENTIALS') {
          sendResponse({
            success: true,
            credentials: [createMockCredential('AGE', { claims: { birthDate: '1990-01-01' } })],
          });
          return true;
        }
        if (msg.type === 'APPROVE_VERIFICATION') {
          processedIds.push(msg.requestId!);
          sendResponse({ success: true });
          return true;
        }
      });

      render(<VerificationRequest onComplete={mockOnComplete} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Approve' })).not.toBeDisabled();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Approve' }));

      await waitFor(() => {
        expect(processedIds[0]).toBe('oldest');
      });
    });
  });

  describe('error handling', () => {
    it('shows error message when load fails', async () => {
      addMessageHandler((message, _sender, sendResponse) => {
        const msg = message as { type: string };
        if (msg.type === 'GET_ALL_PENDING_REQUESTS') {
          // Simulate a throw by rejecting
          throw new Error('Network error');
        }
      });

      // Need to catch the unhandled rejection
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      render(<VerificationRequest onComplete={mockOnComplete} />);

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalled();
      });

      consoleSpy.mockRestore();
    });
  });

  describe('icons', () => {
    it('shows age icon for AGE verification', async () => {
      addMessageHandler((message, _sender, sendResponse) => {
        const msg = message as { type: string };
        if (msg.type === 'GET_ALL_PENDING_REQUESTS') {
          sendResponse({
            success: true,
            requests: [createMockRequest({ policyConfig: { type: 'AGE' } })],
          });
          return true;
        }
        if (msg.type === 'GET_CREDENTIALS') {
          sendResponse({ success: true, credentials: [] });
          return true;
        }
      });

      render(<VerificationRequest onComplete={mockOnComplete} />);

      await waitFor(() => {
        expect(screen.getByText('🎂')).toBeInTheDocument();
      });
    });

    it('shows token icon for TOKEN_BALANCE verification', async () => {
      addMessageHandler((message, _sender, sendResponse) => {
        const msg = message as { type: string };
        if (msg.type === 'GET_ALL_PENDING_REQUESTS') {
          sendResponse({
            success: true,
            requests: [createMockRequest({ policyConfig: { type: 'TOKEN_BALANCE' } })],
          });
          return true;
        }
        if (msg.type === 'GET_CREDENTIALS') {
          sendResponse({ success: true, credentials: [] });
          return true;
        }
      });

      render(<VerificationRequest onComplete={mockOnComplete} />);

      await waitFor(() => {
        expect(screen.getByText('💰')).toBeInTheDocument();
      });
    });
  });
});
