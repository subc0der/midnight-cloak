/**
 * Tests for LockScreen component
 *
 * Tests the unlock flow with password validation.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LockScreen from '../../src/popup/pages/LockScreen';
import { addMessageHandler, clearMessageHandlers } from '../setup';

describe('LockScreen', () => {
  const mockOnUnlock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    clearMessageHandlers();
  });

  it('renders the lock screen with password input', () => {
    render(<LockScreen onUnlock={mockOnUnlock} />);

    expect(screen.getByText('Welcome Back')).toBeInTheDocument();
    expect(screen.getByText('Enter your password to unlock')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /unlock/i })).toBeInTheDocument();
  });

  it('disables unlock button when password is empty', () => {
    render(<LockScreen onUnlock={mockOnUnlock} />);

    const button = screen.getByRole('button', { name: /unlock/i });
    expect(button).toBeDisabled();
  });

  it('enables unlock button when password is entered', async () => {
    const user = userEvent.setup();
    render(<LockScreen onUnlock={mockOnUnlock} />);

    const input = screen.getByPlaceholderText('Password');
    await user.type(input, 'mypassword');

    const button = screen.getByRole('button', { name: /unlock/i });
    expect(button).not.toBeDisabled();
  });

  it('calls onUnlock when password is correct', async () => {
    const user = userEvent.setup();

    // Mock successful unlock response
    addMessageHandler((message, _sender, sendResponse) => {
      if ((message as { type: string }).type === 'UNLOCK_VAULT') {
        sendResponse({ success: true });
        return true;
      }
    });

    render(<LockScreen onUnlock={mockOnUnlock} />);

    const input = screen.getByPlaceholderText('Password');
    await user.type(input, 'correctpassword');

    const button = screen.getByRole('button', { name: /unlock/i });
    await user.click(button);

    await waitFor(() => {
      expect(mockOnUnlock).toHaveBeenCalled();
    });
  });

  it('shows error message when password is incorrect', async () => {
    const user = userEvent.setup();

    // Mock failed unlock response
    addMessageHandler((message, _sender, sendResponse) => {
      if ((message as { type: string }).type === 'UNLOCK_VAULT') {
        sendResponse({ success: false, error: 'Incorrect password' });
        return true;
      }
    });

    render(<LockScreen onUnlock={mockOnUnlock} />);

    const input = screen.getByPlaceholderText('Password');
    await user.type(input, 'wrongpassword');

    const button = screen.getByRole('button', { name: /unlock/i });
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText('Incorrect password')).toBeInTheDocument();
    });

    expect(mockOnUnlock).not.toHaveBeenCalled();
  });

  it('shows loading state during unlock', async () => {
    const user = userEvent.setup();

    // Mock slow unlock response
    addMessageHandler((message, _sender, sendResponse) => {
      if ((message as { type: string }).type === 'UNLOCK_VAULT') {
        // Delay response
        setTimeout(() => sendResponse({ success: true }), 100);
        return true;
      }
    });

    render(<LockScreen onUnlock={mockOnUnlock} />);

    const input = screen.getByPlaceholderText('Password');
    await user.type(input, 'password');

    const button = screen.getByRole('button', { name: /unlock/i });
    await user.click(button);

    // Should show loading state
    expect(screen.getByText('Unlocking...')).toBeInTheDocument();
    expect(button).toBeDisabled();
  });

  it('handles Enter key to submit', async () => {
    const user = userEvent.setup();

    addMessageHandler((message, _sender, sendResponse) => {
      if ((message as { type: string }).type === 'UNLOCK_VAULT') {
        sendResponse({ success: true });
        return true;
      }
    });

    render(<LockScreen onUnlock={mockOnUnlock} />);

    const input = screen.getByPlaceholderText('Password');
    await user.type(input, 'password{Enter}');

    await waitFor(() => {
      expect(mockOnUnlock).toHaveBeenCalled();
    });
  });

  it('shows generic error on communication failure', async () => {
    const user = userEvent.setup();

    // Mock communication error (no response handler)
    // The sendMessage will resolve with undefined

    render(<LockScreen onUnlock={mockOnUnlock} />);

    const input = screen.getByPlaceholderText('Password');
    await user.type(input, 'password');

    const button = screen.getByRole('button', { name: /unlock/i });
    await user.click(button);

    await waitFor(() => {
      // When response is undefined, should show generic error
      // Note: The component expects response.success, undefined will throw
      expect(screen.getByText(/failed to unlock/i)).toBeInTheDocument();
    });
  });

  it('clears error when typing new password', async () => {
    const user = userEvent.setup();

    // First, trigger an error
    addMessageHandler((message, _sender, sendResponse) => {
      if ((message as { type: string }).type === 'UNLOCK_VAULT') {
        sendResponse({ success: false, error: 'Incorrect password' });
        return true;
      }
    });

    render(<LockScreen onUnlock={mockOnUnlock} />);

    const input = screen.getByPlaceholderText('Password');
    await user.type(input, 'wrong');
    await user.click(screen.getByRole('button', { name: /unlock/i }));

    await waitFor(() => {
      expect(screen.getByText('Incorrect password')).toBeInTheDocument();
    });

    // Clear the handler and add a new one
    clearMessageHandlers();
    addMessageHandler((message, _sender, sendResponse) => {
      if ((message as { type: string }).type === 'UNLOCK_VAULT') {
        sendResponse({ success: true });
        return true;
      }
    });

    // Type more (error should clear when trying again)
    await user.clear(input);
    await user.type(input, 'correct');
    await user.click(screen.getByRole('button', { name: /unlock/i }));

    await waitFor(() => {
      expect(mockOnUnlock).toHaveBeenCalled();
    });
  });

  it('auto-focuses password input', () => {
    render(<LockScreen onUnlock={mockOnUnlock} />);

    const input = screen.getByPlaceholderText('Password');
    expect(document.activeElement).toBe(input);
  });
});
