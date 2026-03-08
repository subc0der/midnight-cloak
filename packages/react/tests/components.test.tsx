import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MidnightCloakProvider } from '../src/components/MidnightCloakProvider';
import { VerifyButton } from '../src/components/VerifyButton';
import { CredentialGate } from '../src/components/CredentialGate';
import { MidnightCloakClient } from '@midnight-cloak/core';
import type { ReactNode } from 'react';

// Create a mock client with mock wallet
function createMockClient() {
  const client = new MidnightCloakClient({
    network: 'preprod',
    allowMockProofs: true, // Enable mocks for testing
  });
  client.useMockWallet({ network: 'preprod' });
  return client;
}

// Wrapper component for testing
function TestWrapper({ children, client }: { children: ReactNode; client?: MidnightCloakClient }) {
  const testClient = client ?? createMockClient();
  return (
    <MidnightCloakProvider client={testClient}>
      {children}
    </MidnightCloakProvider>
  );
}

describe('MidnightCloakProvider', () => {
  it('should render children', () => {
    render(
      <MidnightCloakProvider network="preprod">
        <div data-testid="child">Hello</div>
      </MidnightCloakProvider>
    );

    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('should throw when network is not provided and no client', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      render(
        <MidnightCloakProvider>
          <div>Test</div>
        </MidnightCloakProvider>
      );
    }).toThrow('MidnightCloakProvider requires either a client prop or network prop');

    consoleSpy.mockRestore();
  });

  it('should accept pre-configured client', () => {
    const client = createMockClient();

    render(
      <MidnightCloakProvider client={client}>
        <div data-testid="child">Hello</div>
      </MidnightCloakProvider>
    );

    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('should call onError when error occurs', async () => {
    const onError = vi.fn();
    const client = new MidnightCloakClient({ network: 'preprod' });

    render(
      <MidnightCloakProvider client={client} onError={onError}>
        <div>Test</div>
      </MidnightCloakProvider>
    );

    // Emit a wallet error
    // @ts-expect-error - accessing private method for testing
    client.emit('wallet:error', new Error('Test error'));

    await waitFor(() => {
      expect(onError).toHaveBeenCalled();
    });
  });
});

describe('VerifyButton', () => {
  it('should render with default text', () => {
    render(
      <TestWrapper>
        <VerifyButton policy={{ kind: 'age', minAge: 18 }} />
      </TestWrapper>
    );

    expect(screen.getByRole('button')).toHaveTextContent('Verify');
  });

  it('should render with custom children', () => {
    render(
      <TestWrapper>
        <VerifyButton policy={{ kind: 'age', minAge: 18 }}>
          Verify Age (18+)
        </VerifyButton>
      </TestWrapper>
    );

    expect(screen.getByRole('button')).toHaveTextContent('Verify Age (18+)');
  });

  it('should show loading state during verification', async () => {
    render(
      <TestWrapper>
        <VerifyButton policy={{ kind: 'age', minAge: 18 }}>
          Verify
        </VerifyButton>
      </TestWrapper>
    );

    const button = screen.getByRole('button');
    fireEvent.click(button);

    // Button should show loading state
    expect(button).toHaveTextContent('Verifying...');
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');

    // Wait for verification to complete (increased timeout for async operations)
    await waitFor(() => {
      expect(button).not.toHaveTextContent('Verifying...');
    }, { timeout: 3000 });
  });

  it('should call onVerified on successful verification', async () => {
    const onVerified = vi.fn();

    render(
      <TestWrapper>
        <VerifyButton
          policy={{ kind: 'age', minAge: 18 }}
          onVerified={onVerified}
        >
          Verify
        </VerifyButton>
      </TestWrapper>
    );

    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(onVerified).toHaveBeenCalled();
    });

    expect(onVerified.mock.calls[0][0]).toHaveProperty('verified', true);
  });

  it('should accept convenience props', async () => {
    const onVerified = vi.fn();

    render(
      <TestWrapper>
        <VerifyButton
          verificationType="AGE"
          minAge={21}
          onVerified={onVerified}
        >
          Verify 21+
        </VerifyButton>
      </TestWrapper>
    );

    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(onVerified).toHaveBeenCalled();
    });
  });

  it('should pass through button props', () => {
    render(
      <TestWrapper>
        <VerifyButton
          policy={{ kind: 'age', minAge: 18 }}
          className="custom-class"
          data-testid="verify-btn"
        >
          Verify
        </VerifyButton>
      </TestWrapper>
    );

    const button = screen.getByTestId('verify-btn');
    expect(button).toHaveClass('custom-class');
  });

  it('should be disabled when disabled prop is true', () => {
    render(
      <TestWrapper>
        <VerifyButton
          policy={{ kind: 'age', minAge: 18 }}
          disabled
        >
          Verify
        </VerifyButton>
      </TestWrapper>
    );

    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('should throw when neither policy nor verificationType provided', async () => {
    const onVerificationError = vi.fn();

    render(
      <TestWrapper>
        <VerifyButton onVerificationError={onVerificationError}>
          Verify
        </VerifyButton>
      </TestWrapper>
    );

    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(onVerificationError).toHaveBeenCalled();
    });

    expect(onVerificationError.mock.calls[0][0].message).toContain(
      'Either policy or verificationType must be provided'
    );
  });
});

describe('CredentialGate', () => {
  beforeEach(() => {
    // Clear sessionStorage before each test
    window.sessionStorage.clear();
  });

  it('should show default fallback when unverified and no custom fallback', async () => {
    render(
      <TestWrapper>
        <CredentialGate
          policy={{ kind: 'age', minAge: 18 }}
          persistSession={false}
        >
          <div data-testid="content">Protected Content</div>
        </CredentialGate>
      </TestWrapper>
    );

    // Should show default fallback UI
    await waitFor(() => {
      expect(screen.getByText('Verification required')).toBeInTheDocument();
    });
  });

  it('should show fallback when unverified', async () => {
    render(
      <TestWrapper>
        <CredentialGate
          policy={{ kind: 'age', minAge: 18 }}
          persistSession={false}
          fallback={<div data-testid="fallback">Please verify</div>}
        >
          <div data-testid="content">Protected Content</div>
        </CredentialGate>
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByTestId('fallback')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('content')).not.toBeInTheDocument();
  });

  it('should show children when verified', async () => {
    render(
      <TestWrapper>
        <CredentialGate
          policy={{ kind: 'age', minAge: 18 }}
          persistSession={false}
          fallback={({ verify }) => (
            <button data-testid="verify-btn" onClick={verify}>
              Verify
            </button>
          )}
        >
          <div data-testid="content">Protected Content</div>
        </CredentialGate>
      </TestWrapper>
    );

    // Wait for unverified state
    await waitFor(() => {
      expect(screen.getByTestId('verify-btn')).toBeInTheDocument();
    });

    // Click verify
    fireEvent.click(screen.getByTestId('verify-btn'));

    // Wait for verification and content to appear
    await waitFor(() => {
      expect(screen.getByTestId('content')).toBeInTheDocument();
    });
  });

  it('should call onVerified callback', async () => {
    const onVerified = vi.fn();

    render(
      <TestWrapper>
        <CredentialGate
          policy={{ kind: 'age', minAge: 18 }}
          persistSession={false}
          onVerified={onVerified}
          fallback={({ verify }) => (
            <button data-testid="verify-btn" onClick={verify}>
              Verify
            </button>
          )}
        >
          <div>Content</div>
        </CredentialGate>
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByTestId('verify-btn')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('verify-btn'));

    await waitFor(() => {
      expect(onVerified).toHaveBeenCalled();
    });
  });

  it('should provide render props to fallback function', async () => {
    render(
      <TestWrapper>
        <CredentialGate
          policy={{ kind: 'age', minAge: 18 }}
          persistSession={false}
          fallback={({ status, verify, reset, isLoading }) => (
            <div>
              <span data-testid="status">{status}</span>
              <span data-testid="loading">{isLoading ? 'yes' : 'no'}</span>
              <button data-testid="verify" onClick={verify}>Verify</button>
              <button data-testid="reset" onClick={reset}>Reset</button>
            </div>
          )}
        >
          <div>Content</div>
        </CredentialGate>
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('unverified');
    });

    expect(screen.getByTestId('loading')).toHaveTextContent('no');
    expect(screen.getByTestId('verify')).toBeInTheDocument();
    expect(screen.getByTestId('reset')).toBeInTheDocument();
  });

  it('should persist session to sessionStorage', async () => {
    render(
      <TestWrapper>
        <CredentialGate
          policy={{ kind: 'age', minAge: 18 }}
          persistSession={true}
          sessionDuration={3600}
          fallback={({ verify }) => (
            <button data-testid="verify-btn" onClick={verify}>
              Verify
            </button>
          )}
        >
          <div data-testid="content">Content</div>
        </CredentialGate>
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByTestId('verify-btn')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('verify-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('content')).toBeInTheDocument();
    });

    // Check sessionStorage was called
    expect(window.sessionStorage.setItem).toHaveBeenCalled();
  });

  it('should throw when neither policy nor require provided', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      render(
        <TestWrapper>
          <CredentialGate>
            <div>Content</div>
          </CredentialGate>
        </TestWrapper>
      );
    }).toThrow('CredentialGate requires either policy or require prop');

    consoleSpy.mockRestore();
  });

  it('should accept require prop with convenience format', async () => {
    render(
      <TestWrapper>
        <CredentialGate
          require={{ verificationType: 'AGE', minAge: 21 }}
          persistSession={false}
          fallback={({ verify }) => (
            <button data-testid="verify-btn" onClick={verify}>
              Verify
            </button>
          )}
        >
          <div data-testid="content">Content</div>
        </CredentialGate>
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByTestId('verify-btn')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('verify-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('content')).toBeInTheDocument();
    });
  });
});
