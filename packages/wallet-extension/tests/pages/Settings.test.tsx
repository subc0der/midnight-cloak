/**
 * Tests for Settings component
 *
 * Tests auto-lock settings, trusted issuers management, and reset functionality.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import Settings from '../../src/popup/pages/Settings';
import { addMessageHandler, clearMessageHandlers, setMockStorage } from '../setup';

// Mock useNavigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock window.confirm
const mockConfirm = vi.fn();
window.confirm = mockConfirm;

// Mock window.location.reload
const mockReload = vi.fn();
Object.defineProperty(window, 'location', {
  value: { reload: mockReload },
  writable: true,
});

function renderSettings(onLock = vi.fn()) {
  return render(
    <BrowserRouter>
      <Settings onLock={onLock} />
    </BrowserRouter>
  );
}

describe('Settings', () => {
  const mockOnLock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    clearMessageHandlers();
    setMockStorage({});

    // Default handlers
    addMessageHandler((message, _sender, sendResponse) => {
      const msg = message as { type: string; minutes?: number; address?: string; issuer?: { address: string; name: string } };

      switch (msg.type) {
        case 'GET_TRUSTED_ISSUERS':
          sendResponse({ success: true, issuers: [] });
          return true;
        case 'LOCK_VAULT':
          sendResponse({ success: true });
          return true;
        case 'UPDATE_AUTO_LOCK':
          sendResponse({ success: true });
          return true;
        case 'ADD_TRUSTED_ISSUER':
          sendResponse({ success: true });
          return true;
        case 'REMOVE_TRUSTED_ISSUER':
          sendResponse({ success: true });
          return true;
      }
    });
  });

  describe('header', () => {
    it('shows settings title', async () => {
      renderSettings(mockOnLock);

      // Wait for async state updates to complete (avoids act() warnings)
      await waitFor(() => {
        expect(screen.getByText('Settings')).toBeInTheDocument();
      });
    });

    it('navigates back on back button click', async () => {
      renderSettings(mockOnLock);

      // Wait for component to finish loading before interacting
      await waitFor(() => {
        expect(screen.getByText('Settings')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('←'));
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });

  describe('auto-lock settings', () => {
    it('shows auto-lock dropdown', async () => {
      renderSettings(mockOnLock);

      await waitFor(() => {
        expect(screen.getByText('Auto-lock after')).toBeInTheDocument();
      });

      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    it('loads saved auto-lock value', async () => {
      setMockStorage({ autoLockMinutes: 15 });
      renderSettings(mockOnLock);

      await waitFor(() => {
        const select = screen.getByRole('combobox');
        expect(select).toHaveValue('15');
      });
    });

    it('saves auto-lock value on change', async () => {
      const user = userEvent.setup();
      renderSettings(mockOnLock);

      await waitFor(() => {
        expect(screen.getByRole('combobox')).toBeInTheDocument();
      });

      await user.selectOptions(screen.getByRole('combobox'), '30');

      await waitFor(() => {
        expect(screen.getByRole('combobox')).toHaveValue('30');
      });
    });
  });

  describe('lock functionality', () => {
    it('shows lock button', async () => {
      renderSettings(mockOnLock);

      await waitFor(() => {
        expect(screen.getByText('Lock now')).toBeInTheDocument();
      });
    });

    it('locks vault and calls onLock', async () => {
      renderSettings(mockOnLock);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /lock/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /lock/i }));

      await waitFor(() => {
        expect(mockOnLock).toHaveBeenCalled();
      });
    });
  });

  describe('trusted issuers', () => {
    it('shows empty state when no issuers', async () => {
      renderSettings(mockOnLock);

      await waitFor(() => {
        expect(screen.getByText('No trusted issuers yet')).toBeInTheDocument();
      });
    });

    it('shows add issuer button', async () => {
      renderSettings(mockOnLock);

      await waitFor(() => {
        expect(screen.getByText('+ Add Issuer')).toBeInTheDocument();
      });
    });

    it('shows add issuer form when clicking add button', async () => {
      const user = userEvent.setup();
      renderSettings(mockOnLock);

      await waitFor(() => {
        expect(screen.getByText('+ Add Issuer')).toBeInTheDocument();
      });

      await user.click(screen.getByText('+ Add Issuer'));

      expect(screen.getByPlaceholderText(/issuer address/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/display name/i)).toBeInTheDocument();
    });

    it('validates empty address', async () => {
      const user = userEvent.setup();
      renderSettings(mockOnLock);

      await waitFor(() => {
        expect(screen.getByText('+ Add Issuer')).toBeInTheDocument();
      });

      await user.click(screen.getByText('+ Add Issuer'));
      await user.click(screen.getByRole('button', { name: 'Add' }));

      expect(screen.getByText('Please enter an issuer address')).toBeInTheDocument();
    });

    it('validates empty name', async () => {
      const user = userEvent.setup();
      renderSettings(mockOnLock);

      await waitFor(() => {
        expect(screen.getByText('+ Add Issuer')).toBeInTheDocument();
      });

      await user.click(screen.getByText('+ Add Issuer'));
      await user.type(screen.getByPlaceholderText(/issuer address/i), 'a'.repeat(64));
      await user.click(screen.getByRole('button', { name: 'Add' }));

      expect(screen.getByText('Please enter a display name')).toBeInTheDocument();
    });

    it('cancels add issuer form', async () => {
      const user = userEvent.setup();
      renderSettings(mockOnLock);

      await waitFor(() => {
        expect(screen.getByText('+ Add Issuer')).toBeInTheDocument();
      });

      await user.click(screen.getByText('+ Add Issuer'));
      expect(screen.getByPlaceholderText(/issuer address/i)).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(screen.queryByPlaceholderText(/issuer address/i)).not.toBeInTheDocument();
      expect(screen.getByText('+ Add Issuer')).toBeInTheDocument();
    });

    it('displays trusted issuers list', async () => {
      clearMessageHandlers();
      addMessageHandler((message, _sender, sendResponse) => {
        const msg = message as { type: string };
        if (msg.type === 'GET_TRUSTED_ISSUERS') {
          sendResponse({
            success: true,
            issuers: [
              {
                address: 'a'.repeat(64),
                name: 'Test Issuer',
                addedAt: Date.now(),
              },
            ],
          });
          return true;
        }
      });

      renderSettings(mockOnLock);

      await waitFor(() => {
        expect(screen.getByText('Test Issuer')).toBeInTheDocument();
      });

      // Shows truncated address
      expect(screen.getByText(/aaaaaaaaaaaa\.\.\.aaaaaaaaaaaa/)).toBeInTheDocument();
    });

    it('removes issuer on remove button click', async () => {
      const user = userEvent.setup();
      let issuers = [{ address: 'a'.repeat(64), name: 'Test Issuer', addedAt: Date.now() }];

      clearMessageHandlers();
      addMessageHandler((message, _sender, sendResponse) => {
        const msg = message as { type: string; address?: string };
        if (msg.type === 'GET_TRUSTED_ISSUERS') {
          sendResponse({ success: true, issuers });
          return true;
        }
        if (msg.type === 'REMOVE_TRUSTED_ISSUER') {
          issuers = [];
          sendResponse({ success: true });
          return true;
        }
      });

      renderSettings(mockOnLock);

      await waitFor(() => {
        expect(screen.getByText('Test Issuer')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Remove' }));

      await waitFor(() => {
        expect(screen.getByText('No trusted issuers yet')).toBeInTheDocument();
      });
    });
  });

  describe('about section', () => {
    it('shows version', async () => {
      renderSettings(mockOnLock);

      // Wait for async state updates to complete
      await waitFor(() => {
        expect(screen.getByText('Version')).toBeInTheDocument();
      });
      expect(screen.getByText('0.1.0')).toBeInTheDocument();
    });

    it('shows network', async () => {
      renderSettings(mockOnLock);

      // Wait for async state updates to complete
      await waitFor(() => {
        expect(screen.getByText('Network')).toBeInTheDocument();
      });
      expect(screen.getByText('Preprod')).toBeInTheDocument();
    });
  });

  describe('reset functionality', () => {
    it('shows reset button in danger zone', async () => {
      renderSettings(mockOnLock);

      // Wait for async state updates to complete
      await waitFor(() => {
        expect(screen.getByText('Danger Zone')).toBeInTheDocument();
      });
      expect(screen.getByRole('button', { name: /reset extension/i })).toBeInTheDocument();
    });

    it('requires double confirmation for reset', async () => {
      const user = userEvent.setup();
      mockConfirm.mockReturnValueOnce(true).mockReturnValueOnce(true);

      renderSettings(mockOnLock);

      // Wait for component to finish loading
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /reset extension/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /reset extension/i }));

      expect(mockConfirm).toHaveBeenCalledTimes(2);
      expect(mockReload).toHaveBeenCalled();
    });

    it('cancels reset on first confirmation decline', async () => {
      const user = userEvent.setup();
      mockConfirm.mockReturnValueOnce(false);

      renderSettings(mockOnLock);

      // Wait for component to finish loading
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /reset extension/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /reset extension/i }));

      expect(mockConfirm).toHaveBeenCalledTimes(1);
      expect(mockReload).not.toHaveBeenCalled();
    });

    it('cancels reset on second confirmation decline', async () => {
      const user = userEvent.setup();
      mockConfirm.mockReturnValueOnce(true).mockReturnValueOnce(false);

      renderSettings(mockOnLock);

      // Wait for component to finish loading
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /reset extension/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /reset extension/i }));

      expect(mockConfirm).toHaveBeenCalledTimes(2);
      expect(mockReload).not.toHaveBeenCalled();
    });
  });
});
