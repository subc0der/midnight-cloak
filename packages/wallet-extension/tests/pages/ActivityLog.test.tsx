import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ActivityLog from '../../src/popup/pages/ActivityLog';
import type { ActivityEntry } from '../../src/shared/storage/activity-log';

// Mock chrome.runtime
const mockSendMessage = vi.fn();
vi.stubGlobal('chrome', {
  runtime: {
    sendMessage: mockSendMessage,
  },
});

// Mock useNavigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

function renderActivityLog() {
  return render(
    <MemoryRouter>
      <ActivityLog />
    </MemoryRouter>
  );
}

describe('ActivityLog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state initially', () => {
    mockSendMessage.mockImplementation(() => new Promise(() => {})); // Never resolves

    renderActivityLog();

    expect(screen.getByText('Activity')).toBeInTheDocument();
  });

  it('renders empty state when no entries', async () => {
    mockSendMessage.mockResolvedValue({
      success: true,
      entries: [],
    });

    renderActivityLog();

    await waitFor(() => {
      expect(screen.getByText('No Activity Yet')).toBeInTheDocument();
    });

    expect(
      screen.getByText(/Activities will appear here when dApps request credentials/)
    ).toBeInTheDocument();
  });

  it('displays entries with correct labels', async () => {
    const entries: ActivityEntry[] = [
      {
        id: '1',
        type: 'approval',
        origin: 'https://example.com',
        credentialType: 'AGE',
        timestamp: Date.now() - 1000 * 60 * 5, // 5 minutes ago
      },
      {
        id: '2',
        type: 'denial',
        origin: 'https://other.com',
        credentialType: 'TOKEN_BALANCE',
        timestamp: Date.now() - 1000 * 60 * 60 * 2, // 2 hours ago
      },
    ];

    mockSendMessage.mockResolvedValue({
      success: true,
      entries,
    });

    renderActivityLog();

    await waitFor(() => {
      expect(screen.getByText('Approved')).toBeInTheDocument();
    });

    expect(screen.getByText('Denied')).toBeInTheDocument();
    expect(screen.getByText('AGE')).toBeInTheDocument();
    expect(screen.getByText('TOKEN_BALANCE')).toBeInTheDocument();
  });

  it('shows relative timestamps', async () => {
    const entries: ActivityEntry[] = [
      {
        id: '1',
        type: 'verification_request',
        origin: 'https://example.com',
        credentialType: 'AGE',
        timestamp: Date.now() - 1000 * 60 * 30, // 30 minutes ago
      },
    ];

    mockSendMessage.mockResolvedValue({
      success: true,
      entries,
    });

    renderActivityLog();

    await waitFor(() => {
      expect(screen.getByText('30 minutes ago')).toBeInTheDocument();
    });
  });

  it('truncates long origins to hostname', async () => {
    const entries: ActivityEntry[] = [
      {
        id: '1',
        type: 'approval',
        origin: 'https://very-long-subdomain.example.com',
        credentialType: 'AGE',
        timestamp: Date.now(),
      },
    ];

    mockSendMessage.mockResolvedValue({
      success: true,
      entries,
    });

    renderActivityLog();

    await waitFor(() => {
      expect(screen.getByText('very-long-subdomain.example.com')).toBeInTheDocument();
    });
  });

  it('navigates back to home when back button clicked', async () => {
    mockSendMessage.mockResolvedValue({
      success: true,
      entries: [],
    });

    renderActivityLog();

    await waitFor(() => {
      expect(screen.getByText('No Activity Yet')).toBeInTheDocument();
    });

    const backButton = screen.getByRole('button', { name: /←/ });
    fireEvent.click(backButton);

    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('shows confirmation before clearing', async () => {
    const entries: ActivityEntry[] = [
      {
        id: '1',
        type: 'approval',
        origin: 'https://example.com',
        credentialType: 'AGE',
        timestamp: Date.now(),
      },
    ];

    mockSendMessage.mockResolvedValue({
      success: true,
      entries,
    });

    renderActivityLog();

    await waitFor(() => {
      expect(screen.getByText('Approved')).toBeInTheDocument();
    });

    const clearButton = screen.getByText('Clear Activity History');
    fireEvent.click(clearButton);

    expect(screen.getByText('Clear all activity history?')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
    expect(screen.getByText('Clear All')).toBeInTheDocument();
  });

  it('clears entries after confirmation', async () => {
    const entries: ActivityEntry[] = [
      {
        id: '1',
        type: 'approval',
        origin: 'https://example.com',
        credentialType: 'AGE',
        timestamp: Date.now(),
      },
    ];

    mockSendMessage
      .mockResolvedValueOnce({ success: true, entries }) // Initial load
      .mockResolvedValueOnce({ success: true }); // Clear

    renderActivityLog();

    await waitFor(() => {
      expect(screen.getByText('Approved')).toBeInTheDocument();
    });

    // Click clear button
    fireEvent.click(screen.getByText('Clear Activity History'));

    // Click confirm
    fireEvent.click(screen.getByText('Clear All'));

    await waitFor(() => {
      expect(mockSendMessage).toHaveBeenCalledWith({ type: 'CLEAR_ACTIVITY_LOG' });
    });
  });

  it('cancels clear when cancel clicked', async () => {
    const entries: ActivityEntry[] = [
      {
        id: '1',
        type: 'approval',
        origin: 'https://example.com',
        credentialType: 'AGE',
        timestamp: Date.now(),
      },
    ];

    mockSendMessage.mockResolvedValue({ success: true, entries });

    renderActivityLog();

    await waitFor(() => {
      expect(screen.getByText('Approved')).toBeInTheDocument();
    });

    // Click clear button
    fireEvent.click(screen.getByText('Clear Activity History'));

    // Click cancel
    fireEvent.click(screen.getByText('Cancel'));

    // Should still show entry
    expect(screen.getByText('Approved')).toBeInTheDocument();
    expect(screen.queryByText('Clear all activity history?')).not.toBeInTheDocument();
  });

  it('displays all event types correctly', async () => {
    const entries: ActivityEntry[] = [
      { id: '1', type: 'verification_request', origin: 'https://a.com', credentialType: 'AGE', timestamp: Date.now() },
      { id: '2', type: 'approval', origin: 'https://b.com', credentialType: 'AGE', timestamp: Date.now() },
      { id: '3', type: 'denial', origin: 'https://c.com', credentialType: 'AGE', timestamp: Date.now() },
      { id: '4', type: 'credential_offer', origin: 'https://d.com', credentialType: 'AGE', timestamp: Date.now() },
      { id: '5', type: 'credential_accepted', origin: 'https://e.com', credentialType: 'AGE', timestamp: Date.now() },
      { id: '6', type: 'credential_rejected', origin: 'https://f.com', credentialType: 'AGE', timestamp: Date.now() },
    ];

    mockSendMessage.mockResolvedValue({ success: true, entries });

    renderActivityLog();

    await waitFor(() => {
      expect(screen.getByText('Verification Request')).toBeInTheDocument();
    });

    expect(screen.getByText('Approved')).toBeInTheDocument();
    expect(screen.getByText('Denied')).toBeInTheDocument();
    expect(screen.getByText('Credential Offer')).toBeInTheDocument();
    expect(screen.getByText('Credential Accepted')).toBeInTheDocument();
    expect(screen.getByText('Credential Rejected')).toBeInTheDocument();
  });

  describe('error handling', () => {
    it('displays error when load fails', async () => {
      mockSendMessage.mockRejectedValue(new Error('Network error'));

      renderActivityLog();

      await waitFor(() => {
        expect(screen.getByText('Unable to connect to extension')).toBeInTheDocument();
      });
    });

    it('displays error when response indicates failure', async () => {
      mockSendMessage.mockResolvedValue({ success: false });

      renderActivityLog();

      await waitFor(() => {
        expect(screen.getByText('Failed to load activity log')).toBeInTheDocument();
      });
    });

    it('shows retry button on error', async () => {
      mockSendMessage.mockRejectedValueOnce(new Error('Network error'));

      renderActivityLog();

      await waitFor(() => {
        expect(screen.getByText('Retry')).toBeInTheDocument();
      });
    });

    it('retries loading when retry button clicked', async () => {
      mockSendMessage
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ success: true, entries: [] });

      renderActivityLog();

      await waitFor(() => {
        expect(screen.getByText('Retry')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Retry'));

      await waitFor(() => {
        expect(screen.getByText('No Activity Yet')).toBeInTheDocument();
      });
    });

    it('displays error when clear fails', async () => {
      const entries: ActivityEntry[] = [
        { id: '1', type: 'approval', origin: 'https://example.com', credentialType: 'AGE', timestamp: Date.now() },
      ];

      mockSendMessage
        .mockResolvedValueOnce({ success: true, entries })
        .mockRejectedValueOnce(new Error('Clear failed'));

      renderActivityLog();

      await waitFor(() => {
        expect(screen.getByText('Approved')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Clear Activity History'));
      fireEvent.click(screen.getByText('Clear All'));

      await waitFor(() => {
        expect(screen.getByText('Unable to clear activity log')).toBeInTheDocument();
      });
    });
  });
});
