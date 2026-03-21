/**
 * Tests for CredentialDetail component
 *
 * Tests credential display, deletion flow, and edge cases.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CredentialDetail from '../../src/popup/pages/CredentialDetail';
import { addMessageHandler, clearMessageHandlers } from '../setup';

// Mock window.confirm
const mockConfirm = vi.fn();
window.confirm = mockConfirm;

// Mock navigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Valid 64-char hex address for testing
const VALID_ISSUER_ADDRESS = 'a'.repeat(64);
const VALID_SUBJECT_ADDRESS = 'b'.repeat(64);

// Helper to create a mock credential
function createMockCredential(overrides = {}) {
  return {
    id: 'test-cred-1',
    type: 'AGE',
    issuer: VALID_ISSUER_ADDRESS,
    subject: VALID_SUBJECT_ADDRESS,
    claims: { birthDate: '1990-01-15', verified: true },
    issuedAt: new Date('2024-01-15').getTime(),
    expiresAt: new Date('2025-01-15').getTime(),
    signature: new Uint8Array([1, 2, 3]),
    ...overrides,
  };
}

function renderWithRouter(credentialId = 'test-cred-1') {
  return render(
    <MemoryRouter initialEntries={[`/credential/${credentialId}`]}>
      <Routes>
        <Route path="/credential/:id" element={<CredentialDetail />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('CredentialDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMessageHandlers();
    mockConfirm.mockReset();
  });

  describe('loading state', () => {
    it('shows spinner while loading', async () => {
      addMessageHandler(() => {
        // Don't respond immediately
        return false;
      });

      renderWithRouter();

      expect(document.querySelector('.spinner')).toBeTruthy();
    });
  });

  describe('not found state', () => {
    it('shows not found message when credential does not exist', async () => {
      addMessageHandler((message, _sender, sendResponse) => {
        const msg = message as { type: string };
        if (msg.type === 'GET_CREDENTIAL') {
          sendResponse({ success: false });
          return true;
        }
      });

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('Credential not found')).toBeInTheDocument();
      });
    });

    it('shows back button on not found state', async () => {
      addMessageHandler((message, _sender, sendResponse) => {
        const msg = message as { type: string };
        if (msg.type === 'GET_CREDENTIAL') {
          sendResponse({ success: false });
          return true;
        }
      });

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('←')).toBeInTheDocument();
      });
    });
  });

  describe('credential display', () => {
    beforeEach(() => {
      addMessageHandler((message, _sender, sendResponse) => {
        const msg = message as { type: string; id?: string };
        if (msg.type === 'GET_CREDENTIAL') {
          expect(msg.id).toBe('test-cred-1');
          sendResponse({ success: true, credential: createMockCredential() });
          return true;
        }
      });
    });

    it('shows credential type in header', async () => {
      renderWithRouter();

      await waitFor(() => {
        // AGE appears in both header and type field
        expect(screen.getAllByText('AGE').length).toBeGreaterThanOrEqual(1);
      });
    });

    it('shows back button', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('←')).toBeInTheDocument();
      });
    });

    it('navigates back on back button click', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('←')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('←'));
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });

    it('shows credential type', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('Type')).toBeInTheDocument();
        // AGE appears in both header and type field
        expect(screen.getAllByText('AGE').length).toBeGreaterThanOrEqual(2);
      });
    });

    it('shows issued date', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('Issued')).toBeInTheDocument();
        // Check for date - format may vary by locale
        expect(screen.getByText(/2024/)).toBeInTheDocument();
      });
    });

    it('shows expiration date', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('Expires')).toBeInTheDocument();
        // Check for date - format may vary by locale
        expect(screen.getByText(/2025/)).toBeInTheDocument();
      });
    });

    it('shows truncated issuer address', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('Issuer')).toBeInTheDocument();
        expect(screen.getByText(/aaaaaaaa\.\.\.aaaaaaaa/)).toBeInTheDocument();
      });
    });

    it('shows credential claims', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('CLAIMS')).toBeInTheDocument();
        expect(screen.getByText('birthDate')).toBeInTheDocument();
        expect(screen.getByText('1990-01-15')).toBeInTheDocument();
        expect(screen.getByText('verified')).toBeInTheDocument();
        expect(screen.getByText('true')).toBeInTheDocument();
      });
    });

    it('shows delete button', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete credential/i })).toBeInTheDocument();
      });
    });
  });

  describe('credential without expiration', () => {
    it('does not show expiration when not set', async () => {
      addMessageHandler((message, _sender, sendResponse) => {
        const msg = message as { type: string };
        if (msg.type === 'GET_CREDENTIAL') {
          sendResponse({
            success: true,
            credential: createMockCredential({ expiresAt: undefined }),
          });
          return true;
        }
      });

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('Type')).toBeInTheDocument();
      });

      expect(screen.queryByText('Expires')).not.toBeInTheDocument();
    });
  });

  describe('credential without claims', () => {
    it('does not show claims section when empty', async () => {
      addMessageHandler((message, _sender, sendResponse) => {
        const msg = message as { type: string };
        if (msg.type === 'GET_CREDENTIAL') {
          sendResponse({
            success: true,
            credential: createMockCredential({ claims: {} }),
          });
          return true;
        }
      });

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('Type')).toBeInTheDocument();
      });

      expect(screen.queryByText('CLAIMS')).not.toBeInTheDocument();
    });
  });

  describe('delete flow', () => {
    beforeEach(() => {
      addMessageHandler((message, _sender, sendResponse) => {
        const msg = message as { type: string };
        if (msg.type === 'GET_CREDENTIAL') {
          sendResponse({ success: true, credential: createMockCredential() });
          return true;
        }
        if (msg.type === 'DELETE_CREDENTIAL') {
          sendResponse({ success: true });
          return true;
        }
      });
    });

    it('shows confirmation dialog before delete', async () => {
      mockConfirm.mockReturnValue(false);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete credential/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /delete credential/i }));

      expect(mockConfirm).toHaveBeenCalledWith('Are you sure you want to delete this credential?');
    });

    it('does not delete when confirmation is cancelled', async () => {
      let deleteCount = 0;
      clearMessageHandlers();
      addMessageHandler((message, _sender, sendResponse) => {
        const msg = message as { type: string };
        if (msg.type === 'GET_CREDENTIAL') {
          sendResponse({ success: true, credential: createMockCredential() });
          return true;
        }
        if (msg.type === 'DELETE_CREDENTIAL') {
          deleteCount++;
          sendResponse({ success: true });
          return true;
        }
      });

      mockConfirm.mockReturnValue(false);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete credential/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /delete credential/i }));

      expect(deleteCount).toBe(0);
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('deletes credential and navigates home on confirmation', async () => {
      let deleteCount = 0;
      clearMessageHandlers();
      addMessageHandler((message, _sender, sendResponse) => {
        const msg = message as { type: string; id?: string };
        if (msg.type === 'GET_CREDENTIAL') {
          sendResponse({ success: true, credential: createMockCredential() });
          return true;
        }
        if (msg.type === 'DELETE_CREDENTIAL') {
          deleteCount++;
          expect(msg.id).toBe('test-cred-1');
          sendResponse({ success: true });
          return true;
        }
      });

      mockConfirm.mockReturnValue(true);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete credential/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /delete credential/i }));

      await waitFor(() => {
        expect(deleteCount).toBe(1);
        expect(mockNavigate).toHaveBeenCalledWith('/');
      });
    });

    it('shows deleting state while processing', async () => {
      let resolveDelete: (value: unknown) => void;
      const deletePromise = new Promise((resolve) => {
        resolveDelete = resolve;
      });

      clearMessageHandlers();
      addMessageHandler((message, _sender, sendResponse) => {
        const msg = message as { type: string };
        if (msg.type === 'GET_CREDENTIAL') {
          sendResponse({ success: true, credential: createMockCredential() });
          return true;
        }
        if (msg.type === 'DELETE_CREDENTIAL') {
          deletePromise.then(() => sendResponse({ success: true }));
          return true;
        }
      });

      mockConfirm.mockReturnValue(true);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete credential/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /delete credential/i }));

      await waitFor(() => {
        expect(screen.getByText('Deleting...')).toBeInTheDocument();
      });

      resolveDelete!({ success: true });
    });

    it('disables button while deleting', async () => {
      let resolveDelete: (value: unknown) => void;
      const deletePromise = new Promise((resolve) => {
        resolveDelete = resolve;
      });

      clearMessageHandlers();
      addMessageHandler((message, _sender, sendResponse) => {
        const msg = message as { type: string };
        if (msg.type === 'GET_CREDENTIAL') {
          sendResponse({ success: true, credential: createMockCredential() });
          return true;
        }
        if (msg.type === 'DELETE_CREDENTIAL') {
          deletePromise.then(() => sendResponse({ success: true }));
          return true;
        }
      });

      mockConfirm.mockReturnValue(true);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete credential/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /delete credential/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /deleting/i })).toBeDisabled();
      });

      resolveDelete!({ success: true });
    });
  });

  describe('different credential types', () => {
    it('shows TOKEN_BALANCE type', async () => {
      addMessageHandler((message, _sender, sendResponse) => {
        const msg = message as { type: string };
        if (msg.type === 'GET_CREDENTIAL') {
          sendResponse({
            success: true,
            credential: createMockCredential({
              type: 'TOKEN_BALANCE',
              claims: { balance: 1000, token: 'ADA' },
            }),
          });
          return true;
        }
      });

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('TOKEN BALANCE')).toBeInTheDocument();
      });
    });

    it('shows NFT_OWNERSHIP type', async () => {
      addMessageHandler((message, _sender, sendResponse) => {
        const msg = message as { type: string };
        if (msg.type === 'GET_CREDENTIAL') {
          sendResponse({
            success: true,
            credential: createMockCredential({
              type: 'NFT_OWNERSHIP',
              claims: { collection: 'CryptoPunks' },
            }),
          });
          return true;
        }
      });

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('NFT OWNERSHIP')).toBeInTheDocument();
      });
    });
  });
});
