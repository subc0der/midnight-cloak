/**
 * Tests for Onboarding component
 *
 * Tests the wallet setup flow including welcome screen, password creation, and validation.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Onboarding from '../../src/popup/pages/Onboarding';
import { addMessageHandler, clearMessageHandlers } from '../setup';

describe('Onboarding', () => {
  const mockOnComplete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    clearMessageHandlers();
  });

  describe('welcome step', () => {
    it('shows app name', () => {
      render(<Onboarding onComplete={mockOnComplete} />);

      expect(screen.getByText('Midnight Cloak')).toBeInTheDocument();
    });

    it('shows app description', () => {
      render(<Onboarding onComplete={mockOnComplete} />);

      expect(screen.getByText(/zero-knowledge identity wallet/i)).toBeInTheDocument();
    });

    it('shows get started button', () => {
      render(<Onboarding onComplete={mockOnComplete} />);

      expect(screen.getByRole('button', { name: /get started/i })).toBeInTheDocument();
    });

    it('shows logo image', () => {
      render(<Onboarding onComplete={mockOnComplete} />);

      expect(screen.getByAltText('Midnight Cloak')).toBeInTheDocument();
    });

    it('navigates to password step on get started click', async () => {
      const user = userEvent.setup();
      render(<Onboarding onComplete={mockOnComplete} />);

      await user.click(screen.getByRole('button', { name: /get started/i }));

      expect(screen.getByText('Create Password')).toBeInTheDocument();
    });
  });

  describe('password step', () => {
    beforeEach(async () => {
      render(<Onboarding onComplete={mockOnComplete} />);
      const user = userEvent.setup();
      await user.click(screen.getByRole('button', { name: /get started/i }));
    });

    it('shows password creation header', () => {
      expect(screen.getByText('Create Password')).toBeInTheDocument();
    });

    it('shows password description', () => {
      expect(screen.getByText(/encrypts your credentials locally/i)).toBeInTheDocument();
    });

    it('shows password input', () => {
      expect(screen.getByLabelText('Password')).toBeInTheDocument();
    });

    it('shows confirm password input', () => {
      expect(screen.getByLabelText('Confirm Password')).toBeInTheDocument();
    });

    it('shows create wallet button', () => {
      expect(screen.getByRole('button', { name: /create wallet/i })).toBeInTheDocument();
    });

    it('shows back button', () => {
      expect(screen.getByRole('button', { name: /back/i })).toBeInTheDocument();
    });

    it('navigates back to welcome on back button click', async () => {
      const user = userEvent.setup();

      await user.click(screen.getByRole('button', { name: /back/i }));

      expect(screen.getByText('Midnight Cloak')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /get started/i })).toBeInTheDocument();
    });
  });

  describe('password validation', () => {
    // Valid password meeting all requirements: 12+ chars, upper, lower, number, special
    const VALID_PASSWORD = 'SecurePass123!';

    beforeEach(async () => {
      render(<Onboarding onComplete={mockOnComplete} />);
      fireEvent.click(screen.getByRole('button', { name: /get started/i }));
    });

    it('disables create button when password is empty', () => {
      expect(screen.getByRole('button', { name: /create wallet/i })).toBeDisabled();
    });

    it('disables create button when confirm password is empty', async () => {
      const user = userEvent.setup();

      await user.type(screen.getByLabelText('Password'), VALID_PASSWORD);

      expect(screen.getByRole('button', { name: /create wallet/i })).toBeDisabled();
    });

    it('shows error for password less than 12 characters', async () => {
      const user = userEvent.setup();

      await user.type(screen.getByLabelText('Password'), 'Short1!');
      await user.type(screen.getByLabelText('Confirm Password'), 'Short1!');
      await user.click(screen.getByRole('button', { name: /create wallet/i }));

      expect(screen.getByText(/at least 12 characters/i)).toBeInTheDocument();
    });

    it('shows error when password lacks uppercase letter', async () => {
      const user = userEvent.setup();

      await user.type(screen.getByLabelText('Password'), 'nouppercase123!');
      await user.type(screen.getByLabelText('Confirm Password'), 'nouppercase123!');
      await user.click(screen.getByRole('button', { name: /create wallet/i }));

      expect(screen.getByText(/uppercase letter/i)).toBeInTheDocument();
    });

    it('shows error when password lacks lowercase letter', async () => {
      const user = userEvent.setup();

      await user.type(screen.getByLabelText('Password'), 'NOLOWERCASE123!');
      await user.type(screen.getByLabelText('Confirm Password'), 'NOLOWERCASE123!');
      await user.click(screen.getByRole('button', { name: /create wallet/i }));

      expect(screen.getByText(/lowercase letter/i)).toBeInTheDocument();
    });

    it('shows error when password lacks number', async () => {
      const user = userEvent.setup();

      await user.type(screen.getByLabelText('Password'), 'NoNumberHere!!');
      await user.type(screen.getByLabelText('Confirm Password'), 'NoNumberHere!!');
      await user.click(screen.getByRole('button', { name: /create wallet/i }));

      expect(screen.getByText(/at least one number/i)).toBeInTheDocument();
    });

    it('shows error when password lacks special character', async () => {
      const user = userEvent.setup();

      await user.type(screen.getByLabelText('Password'), 'NoSpecialChar123');
      await user.type(screen.getByLabelText('Confirm Password'), 'NoSpecialChar123');
      await user.click(screen.getByRole('button', { name: /create wallet/i }));

      expect(screen.getByText(/special character/i)).toBeInTheDocument();
    });

    it('shows error when passwords do not match', async () => {
      const user = userEvent.setup();

      await user.type(screen.getByLabelText('Password'), VALID_PASSWORD);
      await user.type(screen.getByLabelText('Confirm Password'), 'DifferentPass1!');
      await user.click(screen.getByRole('button', { name: /create wallet/i }));

      expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
    });

    it('accepts password meeting all requirements', async () => {
      addMessageHandler((message, _sender, sendResponse) => {
        const msg = message as { type: string };
        if (msg.type === 'INIT_VAULT') {
          sendResponse({ success: true });
          return true;
        }
      });

      const user = userEvent.setup();

      await user.type(screen.getByLabelText('Password'), VALID_PASSWORD);
      await user.type(screen.getByLabelText('Confirm Password'), VALID_PASSWORD);
      await user.click(screen.getByRole('button', { name: /create wallet/i }));

      // Should not show any password validation errors
      expect(screen.queryByText(/at least 12 characters/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/uppercase letter/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/lowercase letter/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/at least one number/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/special character/i)).not.toBeInTheDocument();
    });
  });

  describe('wallet creation', () => {
    // Valid password meeting all requirements: 12+ chars, upper, lower, number, special
    const VALID_PASSWORD = 'SecurePass123!';

    beforeEach(async () => {
      render(<Onboarding onComplete={mockOnComplete} />);
      fireEvent.click(screen.getByRole('button', { name: /get started/i }));
    });

    it('creates wallet and calls onComplete on success', async () => {
      addMessageHandler((message, _sender, sendResponse) => {
        const msg = message as { type: string; password?: string };
        if (msg.type === 'INIT_VAULT') {
          expect(msg.password).toBe(VALID_PASSWORD);
          sendResponse({ success: true });
          return true;
        }
      });

      const user = userEvent.setup();

      await user.type(screen.getByLabelText('Password'), VALID_PASSWORD);
      await user.type(screen.getByLabelText('Confirm Password'), VALID_PASSWORD);
      await user.click(screen.getByRole('button', { name: /create wallet/i }));

      await waitFor(() => {
        expect(mockOnComplete).toHaveBeenCalled();
      });
    });

    it('shows creating state while processing', async () => {
      let resolveInit: (value: unknown) => void;
      const initPromise = new Promise((resolve) => {
        resolveInit = resolve;
      });

      addMessageHandler((message, _sender, sendResponse) => {
        const msg = message as { type: string };
        if (msg.type === 'INIT_VAULT') {
          initPromise.then(() => sendResponse({ success: true }));
          return true;
        }
      });

      const user = userEvent.setup();

      await user.type(screen.getByLabelText('Password'), VALID_PASSWORD);
      await user.type(screen.getByLabelText('Confirm Password'), VALID_PASSWORD);
      await user.click(screen.getByRole('button', { name: /create wallet/i }));

      await waitFor(() => {
        expect(screen.getByText('Creating...')).toBeInTheDocument();
      });

      resolveInit!({ success: true });
    });

    it('disables inputs while creating', async () => {
      let resolveInit: (value: unknown) => void;
      const initPromise = new Promise((resolve) => {
        resolveInit = resolve;
      });

      addMessageHandler((message, _sender, sendResponse) => {
        const msg = message as { type: string };
        if (msg.type === 'INIT_VAULT') {
          initPromise.then(() => sendResponse({ success: true }));
          return true;
        }
      });

      const user = userEvent.setup();

      await user.type(screen.getByLabelText('Password'), VALID_PASSWORD);
      await user.type(screen.getByLabelText('Confirm Password'), VALID_PASSWORD);
      await user.click(screen.getByRole('button', { name: /create wallet/i }));

      await waitFor(() => {
        expect(screen.getByLabelText('Password')).toBeDisabled();
        expect(screen.getByLabelText('Confirm Password')).toBeDisabled();
        expect(screen.getByRole('button', { name: /back/i })).toBeDisabled();
      });

      resolveInit!({ success: true });
    });

    it('shows error on initialization failure', async () => {
      addMessageHandler((message, _sender, sendResponse) => {
        const msg = message as { type: string };
        if (msg.type === 'INIT_VAULT') {
          sendResponse({ success: false, error: 'Storage error' });
          return true;
        }
      });

      const user = userEvent.setup();

      await user.type(screen.getByLabelText('Password'), VALID_PASSWORD);
      await user.type(screen.getByLabelText('Confirm Password'), VALID_PASSWORD);
      await user.click(screen.getByRole('button', { name: /create wallet/i }));

      await waitFor(() => {
        expect(screen.getByText(/failed to create wallet/i)).toBeInTheDocument();
      });
    });

    it('re-enables form after initialization failure', async () => {
      addMessageHandler((message, _sender, sendResponse) => {
        const msg = message as { type: string };
        if (msg.type === 'INIT_VAULT') {
          sendResponse({ success: false, error: 'Storage error' });
          return true;
        }
      });

      const user = userEvent.setup();

      await user.type(screen.getByLabelText('Password'), VALID_PASSWORD);
      await user.type(screen.getByLabelText('Confirm Password'), VALID_PASSWORD);
      await user.click(screen.getByRole('button', { name: /create wallet/i }));

      await waitFor(() => {
        expect(screen.getByLabelText('Password')).not.toBeDisabled();
        expect(screen.getByLabelText('Confirm Password')).not.toBeDisabled();
      });
    });

    it('clears error when attempting again', async () => {
      addMessageHandler((message, _sender, sendResponse) => {
        const msg = message as { type: string };
        if (msg.type === 'INIT_VAULT') {
          sendResponse({ success: false, error: 'Storage error' });
          return true;
        }
      });

      const user = userEvent.setup();

      // First attempt - fails
      await user.type(screen.getByLabelText('Password'), VALID_PASSWORD);
      await user.type(screen.getByLabelText('Confirm Password'), VALID_PASSWORD);
      await user.click(screen.getByRole('button', { name: /create wallet/i }));

      await waitFor(() => {
        expect(screen.getByText(/failed to create wallet/i)).toBeInTheDocument();
      });

      // Clear and update handler for success
      clearMessageHandlers();
      addMessageHandler((message, _sender, sendResponse) => {
        const msg = message as { type: string };
        if (msg.type === 'INIT_VAULT') {
          sendResponse({ success: true });
          return true;
        }
      });

      // Second attempt
      await user.click(screen.getByRole('button', { name: /create wallet/i }));

      await waitFor(() => {
        expect(screen.queryByText(/failed to create wallet/i)).not.toBeInTheDocument();
      });
    });
  });

  describe('password input behavior', () => {
    beforeEach(async () => {
      render(<Onboarding onComplete={mockOnComplete} />);
      fireEvent.click(screen.getByRole('button', { name: /get started/i }));
    });

    it('password input has type password', () => {
      expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
    });

    it('confirm password input has type password', () => {
      expect(screen.getByLabelText('Confirm Password')).toHaveAttribute('type', 'password');
    });

    it('shows placeholder text', () => {
      expect(screen.getByPlaceholderText(/min 12 chars/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/confirm your password/i)).toBeInTheDocument();
    });
  });
});
