/**
 * Error Handling Example
 *
 * Demonstrates proper error handling patterns when using the Midnight Cloak SDK.
 * Shows how to catch specific errors and provide user-friendly feedback.
 *
 * Key concepts:
 * - Error code checking
 * - getErrorGuidance() for user messages
 * - Graceful degradation
 * - Retry patterns
 */

import {
  MidnightCloakClient,
  getErrorGuidance,
  ErrorCode,
  type MidnightCloakError,
} from '@midnight-cloak/core';

// Error handler with specific responses per error type
function handleVerificationError(error: MidnightCloakError): string {
  // Use getErrorGuidance for user-friendly messages
  const guidance = getErrorGuidance(error.code);

  // Log full error for debugging
  console.error('Verification error:', {
    code: error.code,
    message: error.message,
    details: error.details,
  });

  // Return appropriate user message based on error type
  switch (error.code) {
    // Wallet issues
    case ErrorCode.WALLET_NOT_CONNECTED:
      return 'Please connect your Lace wallet to continue.';

    case ErrorCode.WALLET_NOT_FOUND:
      return 'Lace wallet not detected. Please install it from lace.io';

    // Network issues
    case ErrorCode.NETWORK_MISMATCH:
      return `Wrong network. Please switch to ${error.details?.expected || 'preprod'}.`;

    case ErrorCode.NETWORK_ERROR:
      return 'Network connection issue. Please check your internet and try again.';

    // Verification issues
    case ErrorCode.VERIFICATION_FAILED:
      return 'Verification could not be completed. Please ensure you have a valid credential.';

    case ErrorCode.VERIFICATION_REJECTED:
      return 'You declined the verification request.';

    case ErrorCode.VERIFICATION_TIMEOUT:
      return 'Verification timed out. Please try again.';

    case ErrorCode.NO_MATCHING_CREDENTIAL:
      return 'No matching credential found. Please ensure you have the required credential in your wallet.';

    // Proof issues
    case ErrorCode.PROOF_GENERATION_FAILED:
      return 'Could not generate proof. Please try again or contact support.';

    case ErrorCode.PROOF_SERVER_UNAVAILABLE:
      return 'Proof server is temporarily unavailable. Please try again later.';

    // Default: use the guidance system
    default:
      return guidance || error.message;
  }
}

// Example: Basic verification with error handling
async function verifyWithErrorHandling(client: MidnightCloakClient) {
  try {
    const result = await client.verify({
      type: 'AGE',
      policy: { kind: 'age', minAge: 18 },
    });

    if (result.verified) {
      console.log('Verification successful!');
      return { success: true, proof: result.proof };
    } else {
      // Verification completed but user didn't meet requirements
      const message = handleVerificationError(result.error!);
      console.log('User message:', message);
      return { success: false, message };
    }
  } catch (error) {
    // Unexpected error (network, SDK issues, etc.)
    const message = handleVerificationError(error as MidnightCloakError);
    console.log('User message:', message);
    return { success: false, message };
  }
}

// Example: Verification with retry logic
async function verifyWithRetry(
  client: MidnightCloakClient,
  maxRetries: number = 3
) {
  let lastError: MidnightCloakError | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await client.verify({
        type: 'AGE',
        policy: { kind: 'age', minAge: 18 },
      });

      if (result.verified) {
        return { success: true, proof: result.proof };
      }

      // Don't retry user rejections or missing credentials
      if (
        result.error?.code === ErrorCode.VERIFICATION_REJECTED ||
        result.error?.code === ErrorCode.NO_MATCHING_CREDENTIAL
      ) {
        return {
          success: false,
          message: handleVerificationError(result.error),
        };
      }

      lastError = result.error || null;
    } catch (error) {
      lastError = error as MidnightCloakError;

      // Don't retry certain errors
      const nonRetryable = [
        ErrorCode.WALLET_NOT_FOUND,
        ErrorCode.WALLET_NOT_CONNECTED,
        ErrorCode.NETWORK_MISMATCH,
        ErrorCode.VERIFICATION_REJECTED,
      ];

      if (nonRetryable.includes(lastError.code)) {
        return { success: false, message: handleVerificationError(lastError) };
      }
    }

    // Wait before retry (exponential backoff)
    if (attempt < maxRetries) {
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
      console.log(`Retry ${attempt}/${maxRetries} in ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  return {
    success: false,
    message: lastError
      ? handleVerificationError(lastError)
      : 'Verification failed after multiple attempts.',
  };
}

// Example: Graceful degradation when extension not installed
async function verifyWithFallback(client: MidnightCloakClient) {
  // Check if extension is available
  if (typeof window !== 'undefined' && !window.midnightCloak?.isInstalled) {
    return {
      success: false,
      fallback: true,
      message:
        'Midnight Cloak extension not installed. Showing limited content.',
    };
  }

  // Check if wallet is available
  const walletAvailable = await client.isWalletAvailable();
  if (!walletAvailable) {
    return {
      success: false,
      fallback: true,
      message: 'No compatible wallet found. Some features are unavailable.',
    };
  }

  // Proceed with verification
  return verifyWithErrorHandling(client);
}

// React hook pattern for error handling
function useVerificationWithErrors() {
  // This pattern works well with React state
  return {
    verify: async (client: MidnightCloakClient) => {
      const result = await verifyWithErrorHandling(client);
      return result;
    },
    getErrorMessage: (error: MidnightCloakError) => {
      return handleVerificationError(error);
    },
  };
}

// Example usage (prefixed with _ to indicate intentionally unused in module)
async function _main() {
  const client = new MidnightCloakClient({
    network: 'preprod',
    timeout: 30000,
  });

  console.log('Example 1: Basic error handling');
  await verifyWithErrorHandling(client);

  console.log('\nExample 2: Verification with retry');
  await verifyWithRetry(client, 3);

  console.log('\nExample 3: Graceful degradation');
  await verifyWithFallback(client);

  client.disconnect();
}

// TypeScript declaration for window.midnightCloak
declare global {
  interface Window {
    midnightCloak?: {
      isInstalled: boolean;
      version: string;
    };
  }
}

export {
  handleVerificationError,
  verifyWithErrorHandling,
  verifyWithRetry,
  verifyWithFallback,
  useVerificationWithErrors,
};
