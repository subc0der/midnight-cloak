/**
 * Tests for CredentialOffer component
 *
 * Tests the credential acceptance/rejection flow, trust assessment, and UI states.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import CredentialOffer from '../../src/popup/pages/CredentialOffer';
import { addMessageHandler, clearMessageHandlers } from '../setup';
import type { PersistedCredentialOffer } from '../../src/shared/storage/request-queue';
import type { IssuerTrustAssessment } from '../../src/shared/storage/issuer-trust';

// Valid 64-char hex address for testing
const VALID_ISSUER_ADDRESS = 'a'.repeat(64);
const VALID_SUBJECT_ADDRESS = 'b'.repeat(64);

// Helper to create a mock credential offer
function createMockOffer(
  overrides: Partial<PersistedCredentialOffer> = {}
): PersistedCredentialOffer {
  return {
    id: 'test-offer-1',
    origin: 'https://example.com',
    credential: {
      id: 'cred-1',
      type: 'AGE',
      issuer: VALID_ISSUER_ADDRESS,
      subject: VALID_SUBJECT_ADDRESS,
      claims: { birthDate: '1990-01-15', verified: true },
      issuedAt: Date.now(),
      expiresAt: Date.now() + 86400000 * 365, // 1 year
      signature: new Uint8Array([1, 2, 3]),
    },
    timestamp: Date.now(),
    expiresAt: Date.now() + 300000, // 5 minutes
    ...overrides,
  };
}

// Helper to create trust assessment
function createTrustAssessment(
  level: IssuerTrustAssessment['level'] = 'whitelisted',
  warnings: string[] = []
): IssuerTrustAssessment {
  return {
    level,
    warnings,
    issuerName: level === 'whitelisted' ? 'Trusted Issuer' : undefined,
  };
}

describe('CredentialOffer', () => {
  const mockOnComplete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    clearMessageHandlers();
  });

  describe('loading state', () => {
    it('shows spinner while loading', async () => {
      addMessageHandler(() => {
        // Don't respond immediately
        return false;
      });

      render(<CredentialOffer onComplete={mockOnComplete} />);

      expect(document.querySelector('.spinner')).toBeTruthy();
    });
  });

  describe('empty state', () => {
    it('calls onComplete when no pending offers', async () => {
      addMessageHandler((message, _sender, sendResponse) => {
        const msg = message as { type: string };
        if (msg.type === 'GET_ALL_PENDING_OFFERS') {
          sendResponse({ success: true, offers: [] });
          return true;
        }
      });

      render(<CredentialOffer onComplete={mockOnComplete} />);

      await waitFor(() => {
        expect(mockOnComplete).toHaveBeenCalled();
      });
    });
  });

  describe('offer display', () => {
    beforeEach(() => {
      addMessageHandler((message, _sender, sendResponse) => {
        const msg = message as { type: string };
        if (msg.type === 'GET_ALL_PENDING_OFFERS') {
          sendResponse({
            success: true,
            offers: [createMockOffer()],
          });
          return true;
        }
        if (msg.type === 'ASSESS_ISSUER_TRUST') {
          sendResponse({
            success: true,
            assessment: createTrustAssessment(),
          });
          return true;
        }
      });
    });

    it('shows credential offer header', async () => {
      render(<CredentialOffer onComplete={mockOnComplete} />);

      await waitFor(() => {
        expect(screen.getByText('Credential Offer')).toBeInTheDocument();
      });
    });

    it('shows origin of the offer', async () => {
      render(<CredentialOffer onComplete={mockOnComplete} />);

      await waitFor(() => {
        expect(screen.getByText('https://example.com')).toBeInTheDocument();
      });
    });

    it('shows credential type', async () => {
      render(<CredentialOffer onComplete={mockOnComplete} />);

      await waitFor(() => {
        expect(screen.getByText('AGE')).toBeInTheDocument();
      });
    });

    it('shows credential icon', async () => {
      render(<CredentialOffer onComplete={mockOnComplete} />);

      await waitFor(() => {
        expect(screen.getByText('🎂')).toBeInTheDocument();
      });
    });

    it('shows credential claims', async () => {
      render(<CredentialOffer onComplete={mockOnComplete} />);

      await waitFor(() => {
        expect(screen.getByText(/Birth Date: 1990-01-15/)).toBeInTheDocument();
        expect(screen.getByText(/Verified: true/)).toBeInTheDocument();
      });
    });

    it('shows truncated issuer address', async () => {
      render(<CredentialOffer onComplete={mockOnComplete} />);

      await waitFor(() => {
        expect(screen.getByText(/aaaaaaaa\.\.\.aaaaaaaa/)).toBeInTheDocument();
      });
    });

    it('shows expiration date', async () => {
      render(<CredentialOffer onComplete={mockOnComplete} />);

      await waitFor(() => {
        expect(screen.getByText(/Expires:/)).toBeInTheDocument();
      });
    });

    it('shows info message about storage', async () => {
      render(<CredentialOffer onComplete={mockOnComplete} />);

      await waitFor(() => {
        expect(screen.getByText(/stored securely/)).toBeInTheDocument();
      });
    });
  });

  describe('credential types', () => {
    it('shows token balance icon', async () => {
      addMessageHandler((message, _sender, sendResponse) => {
        const msg = message as { type: string };
        if (msg.type === 'GET_ALL_PENDING_OFFERS') {
          sendResponse({
            success: true,
            offers: [
              createMockOffer({
                credential: {
                  ...createMockOffer().credential,
                  type: 'TOKEN_BALANCE',
                  claims: { balance: 1000, token: 'ADA' },
                },
              }),
            ],
          });
          return true;
        }
        if (msg.type === 'ASSESS_ISSUER_TRUST') {
          sendResponse({ success: true, assessment: createTrustAssessment() });
          return true;
        }
      });

      render(<CredentialOffer onComplete={mockOnComplete} />);

      await waitFor(() => {
        expect(screen.getByText('💰')).toBeInTheDocument();
        expect(screen.getByText('TOKEN BALANCE')).toBeInTheDocument();
      });
    });

    it('shows NFT ownership icon', async () => {
      addMessageHandler((message, _sender, sendResponse) => {
        const msg = message as { type: string };
        if (msg.type === 'GET_ALL_PENDING_OFFERS') {
          sendResponse({
            success: true,
            offers: [
              createMockOffer({
                credential: {
                  ...createMockOffer().credential,
                  type: 'NFT_OWNERSHIP',
                  claims: { collection: 'CryptoPunks' },
                },
              }),
            ],
          });
          return true;
        }
        if (msg.type === 'ASSESS_ISSUER_TRUST') {
          sendResponse({ success: true, assessment: createTrustAssessment() });
          return true;
        }
      });

      render(<CredentialOffer onComplete={mockOnComplete} />);

      await waitFor(() => {
        expect(screen.getByText('🖼️')).toBeInTheDocument();
      });
    });
  });

  describe('trust assessment', () => {
    it('shows trusted badge for whitelisted issuer', async () => {
      addMessageHandler((message, _sender, sendResponse) => {
        const msg = message as { type: string };
        if (msg.type === 'GET_ALL_PENDING_OFFERS') {
          sendResponse({ success: true, offers: [createMockOffer()] });
          return true;
        }
        if (msg.type === 'ASSESS_ISSUER_TRUST') {
          sendResponse({
            success: true,
            assessment: createTrustAssessment('whitelisted'),
          });
          return true;
        }
      });

      render(<CredentialOffer onComplete={mockOnComplete} />);

      await waitFor(() => {
        expect(screen.getByText('Trusted')).toBeInTheDocument();
      });
    });

    it('shows unverified badge for self-attested issuer', async () => {
      addMessageHandler((message, _sender, sendResponse) => {
        const msg = message as { type: string };
        if (msg.type === 'GET_ALL_PENDING_OFFERS') {
          sendResponse({ success: true, offers: [createMockOffer()] });
          return true;
        }
        if (msg.type === 'ASSESS_ISSUER_TRUST') {
          sendResponse({
            success: true,
            assessment: createTrustAssessment('self-attested', ['Issuer is not in your trusted list']),
          });
          return true;
        }
      });

      render(<CredentialOffer onComplete={mockOnComplete} />);

      await waitFor(() => {
        expect(screen.getByText('Unverified')).toBeInTheDocument();
      });
    });

    it('shows trust warnings', async () => {
      addMessageHandler((message, _sender, sendResponse) => {
        const msg = message as { type: string };
        if (msg.type === 'GET_ALL_PENDING_OFFERS') {
          sendResponse({ success: true, offers: [createMockOffer()] });
          return true;
        }
        if (msg.type === 'ASSESS_ISSUER_TRUST') {
          sendResponse({
            success: true,
            assessment: createTrustAssessment('self-attested', ['Issuer is not in your trusted list']),
          });
          return true;
        }
      });

      render(<CredentialOffer onComplete={mockOnComplete} />);

      await waitFor(() => {
        expect(screen.getByText('Issuer is not in your trusted list')).toBeInTheDocument();
      });
    });

    it('shows add to trusted button for self-attested issuer', async () => {
      addMessageHandler((message, _sender, sendResponse) => {
        const msg = message as { type: string };
        if (msg.type === 'GET_ALL_PENDING_OFFERS') {
          sendResponse({ success: true, offers: [createMockOffer()] });
          return true;
        }
        if (msg.type === 'ASSESS_ISSUER_TRUST') {
          sendResponse({
            success: true,
            assessment: createTrustAssessment('self-attested', ['Issuer is not in your trusted list']),
          });
          return true;
        }
      });

      render(<CredentialOffer onComplete={mockOnComplete} />);

      await waitFor(() => {
        expect(screen.getByText('Add to trusted issuers')).toBeInTheDocument();
      });
    });

    it('adds issuer to trusted list', async () => {
      let addTrustedCalled = false;
      let assessCallCount = 0;

      addMessageHandler((message, _sender, sendResponse) => {
        const msg = message as { type: string; issuer?: { address: string; name: string } };
        if (msg.type === 'GET_ALL_PENDING_OFFERS') {
          sendResponse({ success: true, offers: [createMockOffer()] });
          return true;
        }
        if (msg.type === 'ASSESS_ISSUER_TRUST') {
          assessCallCount++;
          if (assessCallCount === 1) {
            sendResponse({
              success: true,
              assessment: createTrustAssessment('self-attested', ['Issuer is not in your trusted list']),
            });
          } else {
            // After adding to trusted
            sendResponse({
              success: true,
              assessment: createTrustAssessment('whitelisted'),
            });
          }
          return true;
        }
        if (msg.type === 'ADD_TRUSTED_ISSUER') {
          addTrustedCalled = true;
          expect(msg.issuer?.address).toBe(VALID_ISSUER_ADDRESS);
          sendResponse({ success: true });
          return true;
        }
      });

      render(<CredentialOffer onComplete={mockOnComplete} />);

      await waitFor(() => {
        expect(screen.getByText('Add to trusted issuers')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Add to trusted issuers'));

      await waitFor(() => {
        expect(addTrustedCalled).toBe(true);
        expect(screen.getByText('Trusted')).toBeInTheDocument();
      });
    });
  });

  describe('accept flow', () => {
    it('accepts credential and checks for more offers', async () => {
      let acceptCallCount = 0;
      let getAllCallCount = 0;

      addMessageHandler((message, _sender, sendResponse) => {
        const msg = message as { type: string; offerId?: string };

        if (msg.type === 'GET_ALL_PENDING_OFFERS') {
          getAllCallCount++;
          if (getAllCallCount === 1) {
            sendResponse({ success: true, offers: [createMockOffer()] });
          } else {
            sendResponse({ success: true, offers: [] });
          }
          return true;
        }
        if (msg.type === 'ASSESS_ISSUER_TRUST') {
          sendResponse({ success: true, assessment: createTrustAssessment() });
          return true;
        }
        if (msg.type === 'ACCEPT_CREDENTIAL') {
          acceptCallCount++;
          expect(msg.offerId).toBe('test-offer-1');
          sendResponse({ success: true });
          return true;
        }
      });

      render(<CredentialOffer onComplete={mockOnComplete} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Accept' })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Accept' }));

      await waitFor(() => {
        expect(acceptCallCount).toBe(1);
        expect(mockOnComplete).toHaveBeenCalled();
      });
    });

    it('shows error on accept failure', async () => {
      addMessageHandler((message, _sender, sendResponse) => {
        const msg = message as { type: string };
        if (msg.type === 'GET_ALL_PENDING_OFFERS') {
          sendResponse({ success: true, offers: [createMockOffer()] });
          return true;
        }
        if (msg.type === 'ASSESS_ISSUER_TRUST') {
          sendResponse({ success: true, assessment: createTrustAssessment() });
          return true;
        }
        if (msg.type === 'ACCEPT_CREDENTIAL') {
          sendResponse({ success: false, error: 'Storage full' });
          return true;
        }
      });

      render(<CredentialOffer onComplete={mockOnComplete} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Accept' })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Accept' }));

      await waitFor(() => {
        expect(screen.getByText('Storage full')).toBeInTheDocument();
      });
    });

    it('shows processing state during accept', async () => {
      let resolveAccept: (value: unknown) => void;
      const acceptPromise = new Promise((resolve) => {
        resolveAccept = resolve;
      });

      addMessageHandler((message, _sender, sendResponse) => {
        const msg = message as { type: string };
        if (msg.type === 'GET_ALL_PENDING_OFFERS') {
          sendResponse({ success: true, offers: [createMockOffer()] });
          return true;
        }
        if (msg.type === 'ASSESS_ISSUER_TRUST') {
          sendResponse({ success: true, assessment: createTrustAssessment() });
          return true;
        }
        if (msg.type === 'ACCEPT_CREDENTIAL') {
          acceptPromise.then(() => sendResponse({ success: true }));
          return true;
        }
      });

      render(<CredentialOffer onComplete={mockOnComplete} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Accept' })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Accept' }));

      await waitFor(() => {
        expect(screen.getByText('Saving...')).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: 'Reject' })).toBeDisabled();

      resolveAccept!({ success: true });
    });
  });

  describe('reject flow', () => {
    it('rejects credential and checks for more offers', async () => {
      let rejectCallCount = 0;
      let getAllCallCount = 0;

      addMessageHandler((message, _sender, sendResponse) => {
        const msg = message as { type: string; offerId?: string };

        if (msg.type === 'GET_ALL_PENDING_OFFERS') {
          getAllCallCount++;
          if (getAllCallCount === 1) {
            sendResponse({ success: true, offers: [createMockOffer()] });
          } else {
            sendResponse({ success: true, offers: [] });
          }
          return true;
        }
        if (msg.type === 'ASSESS_ISSUER_TRUST') {
          sendResponse({ success: true, assessment: createTrustAssessment() });
          return true;
        }
        if (msg.type === 'REJECT_CREDENTIAL') {
          rejectCallCount++;
          expect(msg.offerId).toBe('test-offer-1');
          sendResponse({ success: true });
          return true;
        }
      });

      render(<CredentialOffer onComplete={mockOnComplete} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Reject' })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Reject' }));

      await waitFor(() => {
        expect(rejectCallCount).toBe(1);
        expect(mockOnComplete).toHaveBeenCalled();
      });
    });

    it('handles reject via close button', async () => {
      let rejectCallCount = 0;

      addMessageHandler((message, _sender, sendResponse) => {
        const msg = message as { type: string };
        if (msg.type === 'GET_ALL_PENDING_OFFERS') {
          sendResponse({ success: true, offers: [createMockOffer()] });
          return true;
        }
        if (msg.type === 'ASSESS_ISSUER_TRUST') {
          sendResponse({ success: true, assessment: createTrustAssessment() });
          return true;
        }
        if (msg.type === 'REJECT_CREDENTIAL') {
          rejectCallCount++;
          sendResponse({ success: true });
          return true;
        }
      });

      render(<CredentialOffer onComplete={mockOnComplete} />);

      await waitFor(() => {
        expect(screen.getByTitle('Close')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTitle('Close'));

      await waitFor(() => {
        expect(rejectCallCount).toBe(1);
      });
    });
  });

  describe('multiple pending offers', () => {
    it('shows pending count badge when multiple offers', async () => {
      addMessageHandler((message, _sender, sendResponse) => {
        const msg = message as { type: string };
        if (msg.type === 'GET_ALL_PENDING_OFFERS') {
          sendResponse({
            success: true,
            offers: [
              createMockOffer({ id: 'offer-1' }),
              createMockOffer({ id: 'offer-2' }),
              createMockOffer({ id: 'offer-3' }),
            ],
          });
          return true;
        }
        if (msg.type === 'ASSESS_ISSUER_TRUST') {
          sendResponse({ success: true, assessment: createTrustAssessment() });
          return true;
        }
      });

      render(<CredentialOffer onComplete={mockOnComplete} />);

      await waitFor(() => {
        expect(screen.getByText('3')).toBeInTheDocument();
      });
    });

    it('does not show badge when single offer', async () => {
      addMessageHandler((message, _sender, sendResponse) => {
        const msg = message as { type: string };
        if (msg.type === 'GET_ALL_PENDING_OFFERS') {
          sendResponse({ success: true, offers: [createMockOffer()] });
          return true;
        }
        if (msg.type === 'ASSESS_ISSUER_TRUST') {
          sendResponse({ success: true, assessment: createTrustAssessment() });
          return true;
        }
      });

      render(<CredentialOffer onComplete={mockOnComplete} />);

      await waitFor(() => {
        expect(screen.getByText('Credential Offer')).toBeInTheDocument();
      });

      expect(document.querySelector('.pending-badge')).toBeNull();
    });
  });

  describe('claim formatting', () => {
    it('formats camelCase claims', async () => {
      addMessageHandler((message, _sender, sendResponse) => {
        const msg = message as { type: string };
        if (msg.type === 'GET_ALL_PENDING_OFFERS') {
          sendResponse({
            success: true,
            offers: [
              createMockOffer({
                credential: {
                  ...createMockOffer().credential,
                  claims: { firstName: 'John', lastName: 'Doe' },
                },
              }),
            ],
          });
          return true;
        }
        if (msg.type === 'ASSESS_ISSUER_TRUST') {
          sendResponse({ success: true, assessment: createTrustAssessment() });
          return true;
        }
      });

      render(<CredentialOffer onComplete={mockOnComplete} />);

      await waitFor(() => {
        expect(screen.getByText(/First Name: John/)).toBeInTheDocument();
        expect(screen.getByText(/Last Name: Doe/)).toBeInTheDocument();
      });
    });
  });

  describe('credential without expiration', () => {
    it('does not show expiration when not set', async () => {
      addMessageHandler((message, _sender, sendResponse) => {
        const msg = message as { type: string };
        if (msg.type === 'GET_ALL_PENDING_OFFERS') {
          const offer = createMockOffer();
          // Remove expiresAt
          const credWithoutExpiry = { ...offer.credential, expiresAt: undefined };
          sendResponse({
            success: true,
            offers: [{ ...offer, credential: credWithoutExpiry }],
          });
          return true;
        }
        if (msg.type === 'ASSESS_ISSUER_TRUST') {
          sendResponse({ success: true, assessment: createTrustAssessment() });
          return true;
        }
      });

      render(<CredentialOffer onComplete={mockOnComplete} />);

      await waitFor(() => {
        expect(screen.getByText('Credential Offer')).toBeInTheDocument();
      });

      expect(screen.queryByText(/Expires:/)).not.toBeInTheDocument();
    });
  });

  describe('error handling', () => {
    it('shows error when load fails', async () => {
      addMessageHandler((message, _sender, sendResponse) => {
        const msg = message as { type: string };
        if (msg.type === 'GET_ALL_PENDING_OFFERS') {
          sendResponse({ success: false, error: 'Network error' });
          return true;
        }
      });

      render(<CredentialOffer onComplete={mockOnComplete} />);

      // Should still call onComplete on error
      await waitFor(() => {
        expect(mockOnComplete).toHaveBeenCalled();
      });
    });
  });
});
