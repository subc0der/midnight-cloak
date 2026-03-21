/**
 * Tests for Home component
 *
 * Tests credential list display, empty state, and navigation.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Home from '../../src/popup/pages/Home';
import { addMessageHandler, clearMessageHandlers } from '../setup';

// Mock useNavigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

function renderHome(onLock = vi.fn()) {
  return render(
    <BrowserRouter>
      <Home onLock={onLock} />
    </BrowserRouter>
  );
}

describe('Home', () => {
  const mockOnLock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    clearMessageHandlers();
  });

  describe('loading state', () => {
    it('shows loading spinner initially', () => {
      // Don't add any handler - loading will continue
      renderHome(mockOnLock);

      // The component should be in loading state
      const spinner = document.querySelector('.spinner');
      expect(spinner).toBeInTheDocument();
    });
  });

  describe('empty state', () => {
    it('shows empty state when no credentials', async () => {
      addMessageHandler((message, _sender, sendResponse) => {
        if ((message as { type: string }).type === 'GET_CREDENTIALS') {
          sendResponse({ success: true, credentials: [] });
          return true;
        }
      });

      renderHome(mockOnLock);

      await waitFor(() => {
        expect(screen.getByText('No Credentials Yet')).toBeInTheDocument();
      });

      expect(screen.getByText(/Your verified credentials will appear here/)).toBeInTheDocument();
    });
  });

  describe('credential list', () => {
    const mockCredentials = [
      {
        id: 'cred-1',
        type: 'AGE',
        issuer: 'a'.repeat(64),
        subject: 'b'.repeat(64),
        claims: { birthDate: '1990-01-01' },
        issuedAt: new Date('2024-01-15').getTime(),
        expiresAt: null,
        signature: new Uint8Array([1, 2, 3]),
      },
      {
        id: 'cred-2',
        type: 'TOKEN_BALANCE',
        issuer: 'a'.repeat(64),
        subject: 'b'.repeat(64),
        claims: { tokenSymbol: 'ADA', balance: 1000 },
        issuedAt: new Date('2024-02-20').getTime(),
        expiresAt: null,
        signature: new Uint8Array([4, 5, 6]),
      },
    ];

    beforeEach(() => {
      addMessageHandler((message, _sender, sendResponse) => {
        if ((message as { type: string }).type === 'GET_CREDENTIALS') {
          sendResponse({ success: true, credentials: mockCredentials });
          return true;
        }
      });
    });

    it('displays credentials when loaded', async () => {
      renderHome(mockOnLock);

      await waitFor(() => {
        expect(screen.getByText('AGE')).toBeInTheDocument();
      });

      expect(screen.getByText('TOKEN BALANCE')).toBeInTheDocument();
    });

    it('shows correct icons for credential types', async () => {
      renderHome(mockOnLock);

      await waitFor(() => {
        expect(screen.getByText('🎂')).toBeInTheDocument(); // AGE
        expect(screen.getByText('💰')).toBeInTheDocument(); // TOKEN_BALANCE
      });
    });

    it('navigates to credential detail on click', async () => {
      renderHome(mockOnLock);

      await waitFor(() => {
        expect(screen.getByText('AGE')).toBeInTheDocument();
      });

      const credentialCard = screen.getByText('AGE').closest('.credential-card');
      fireEvent.click(credentialCard!);

      expect(mockNavigate).toHaveBeenCalledWith('/credential/cred-1');
    });

    it('formats issue date correctly', async () => {
      renderHome(mockOnLock);

      await waitFor(() => {
        // Check for "Issued" prefix (dates may vary by timezone)
        const issuedElements = screen.getAllByText(/Issued/);
        expect(issuedElements.length).toBe(2);
      });
    });
  });

  describe('header actions', () => {
    beforeEach(() => {
      addMessageHandler((message, _sender, sendResponse) => {
        if ((message as { type: string }).type === 'GET_CREDENTIALS') {
          sendResponse({ success: true, credentials: [] });
          return true;
        }
        if ((message as { type: string }).type === 'LOCK_VAULT') {
          sendResponse({ success: true });
          return true;
        }
      });
    });

    it('renders header with title', async () => {
      renderHome(mockOnLock);

      await waitFor(() => {
        expect(screen.getByText('Midnight Cloak')).toBeInTheDocument();
      });
    });

    it('navigates to settings on settings button click', async () => {
      renderHome(mockOnLock);

      await waitFor(() => {
        expect(screen.getByTitle('Settings')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTitle('Settings'));
      expect(mockNavigate).toHaveBeenCalledWith('/settings');
    });

    it('locks vault and calls onLock', async () => {
      renderHome(mockOnLock);

      await waitFor(() => {
        expect(screen.getByTitle('Lock')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTitle('Lock'));

      await waitFor(() => {
        expect(mockOnLock).toHaveBeenCalled();
      });
    });
  });

  describe('vault locked handling', () => {
    it('calls onLock when vault is locked', async () => {
      addMessageHandler((message, _sender, sendResponse) => {
        if ((message as { type: string }).type === 'GET_CREDENTIALS') {
          sendResponse({ success: false, error: 'Vault is locked' });
          return true;
        }
      });

      renderHome(mockOnLock);

      await waitFor(() => {
        expect(mockOnLock).toHaveBeenCalled();
      });
    });
  });

  describe('error handling', () => {
    it('handles load failure gracefully', async () => {
      // No handler - will throw/reject
      renderHome(mockOnLock);

      // Should eventually show empty state (not crash)
      await waitFor(() => {
        expect(screen.getByText('No Credentials Yet')).toBeInTheDocument();
      });
    });
  });
});
