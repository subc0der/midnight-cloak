/**
 * Content script for Midnight Cloak extension
 *
 * Injected into web pages to enable communication between
 * dApps and the extension.
 *
 * Message flow:
 * dApp → window.postMessage → Content Script → chrome.runtime.sendMessage → Background
 *
 * For verification/credential requests:
 * 1. Background returns immediately with requestId
 * 2. Content script polls POLL_RESPONSE until completed
 * 3. Final response sent to dApp
 *
 * This pattern survives service worker dormancy (Chrome MV3 limitation).
 *
 * Security features:
 * - Message type whitelist prevents unauthorized background access
 * - Request ID correlation prevents response spoofing
 * - Origin validation ensures messages come from same page
 */

const EXTENSION_ID = 'midnight-cloak';
const DAPP_SOURCE = 'midnight-cloak-dapp';

/**
 * Sanitize error messages before sending to dApps.
 * Prevents leaking implementation details, SDK versions, or internal state.
 */
function sanitizeErrorForDapp(error: string): string {
  // Map internal errors to safe, generic messages
  const errorMappings: Array<[RegExp, string]> = [
    [/vault is locked/i, 'Extension is locked'],
    [/no matching credential/i, 'No matching credential found'],
    [/user denied/i, 'Request denied by user'],
    [/user rejected/i, 'Request rejected by user'],
    [/request timed out/i, 'Request timed out'],
    [/unauthorized message type/i, 'Invalid request'],
    [/invalid credential/i, 'Invalid credential data'],
    [/no pending/i, 'No pending request'],
  ];

  for (const [pattern, safeMessage] of errorMappings) {
    if (pattern.test(error)) {
      return safeMessage;
    }
  }

  // For unknown errors, return generic message
  // This prevents SDK errors, stack traces, or internal details from leaking
  console.warn('[MidnightCloak] Sanitized internal error:', error);
  return 'Request failed';
}

// Polling configuration
const POLL_INTERVAL_MS = 1000; // Poll every 1 second
const POLL_TIMEOUT_MS = 5 * 60 * 1000; // 5 minute timeout (matches backend)

/**
 * Whitelist of message types that dApps are allowed to send.
 * Any message type not in this list will be rejected.
 * This prevents malicious dApps from triggering internal extension functions.
 */
const ALLOWED_MESSAGE_TYPES = [
  'VERIFICATION_REQUEST',
  'GET_AVAILABLE_CREDENTIALS',
  'CREDENTIAL_OFFER',
] as const;

type AllowedMessageType = (typeof ALLOWED_MESSAGE_TYPES)[number];

interface MidnightCloakMessage {
  type: string;
  source: string;
  requestId?: string;
  payload?: Record<string, unknown>;
}

/**
 * Check if a message type is in the allowed whitelist
 */
function isAllowedMessageType(type: string): type is AllowedMessageType {
  return ALLOWED_MESSAGE_TYPES.includes(type as AllowedMessageType);
}

/**
 * Message types that require polling for response.
 * These requests return immediately with a requestId, then we poll for completion.
 */
const POLLING_MESSAGE_TYPES = ['VERIFICATION_REQUEST', 'CREDENTIAL_OFFER'] as const;

function requiresPolling(type: string): boolean {
  return (POLLING_MESSAGE_TYPES as readonly string[]).includes(type);
}

/**
 * Poll for response completion.
 * The background script stores completed responses, and we poll until ready.
 *
 * @param requestId The request ID returned from initial request
 * @param timeoutMs Maximum time to poll before giving up
 * @returns The completed response result
 */
async function pollForResponse(
  requestId: string,
  timeoutMs: number = POLL_TIMEOUT_MS
): Promise<unknown> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'POLL_RESPONSE',
        requestId,
      });

      if (response?.completed) {
        return response.result;
      }
    } catch (err) {
      // Service worker may have restarted, continue polling
      console.log('[MidnightCloak] Poll error, retrying...', err);
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  // Timeout reached
  throw new Error('Request timed out waiting for user response');
}

// Listen for messages from the page
window.addEventListener('message', async (event) => {
  // Only accept messages from the same window
  if (event.source !== window) {
    return;
  }

  // Validate origin matches the page (prevents cross-origin attacks)
  if (event.origin !== window.location.origin) {
    return;
  }

  const message = event.data as MidnightCloakMessage;

  // Only process messages intended for us
  if (!message || message.source !== DAPP_SOURCE) {
    return;
  }

  // Security: Reject unauthorized message types
  if (!isAllowedMessageType(message.type)) {
    console.warn(`[MidnightCloak] Blocked unauthorized message type: ${message.type}`);
    // Send error response with requestId if present
    if (message.requestId) {
      window.postMessage(
        {
          type: `${message.type}_RESPONSE`,
          source: EXTENSION_ID,
          requestId: message.requestId,
          payload: { success: false, error: 'Unauthorized message type' },
        },
        window.location.origin
      );
    }
    return;
  }

  try {
    // Forward to background script
    // SECURITY: Spread payload FIRST, then override type with validated value
    // This prevents malicious payloads from overwriting the whitelisted type
    const payload = (message.payload || {}) as Record<string, unknown>;
    const initialResponse = await chrome.runtime.sendMessage({
      ...payload,
      type: message.type, // Validated type always wins
    });

    let finalResponse: unknown;

    // For verification/credential requests, background returns immediately with requestId
    // We then poll until the user approves/denies
    if (requiresPolling(message.type) && initialResponse?.success && initialResponse?.requestId) {
      try {
        const polledResult = await pollForResponse(initialResponse.requestId);
        // Sanitize any error in the polled result
        if (polledResult && typeof polledResult === 'object' && 'error' in polledResult) {
          const result = polledResult as { success: boolean; error?: string };
          if (!result.success && result.error) {
            finalResponse = { ...result, error: sanitizeErrorForDapp(result.error) };
          } else {
            finalResponse = polledResult;
          }
        } else {
          finalResponse = polledResult;
        }
      } catch (pollError) {
        finalResponse = { success: false, error: sanitizeErrorForDapp((pollError as Error).message) };
      }
    } else {
      // Non-polling requests return response directly
      // Sanitize any error messages before sending to dApp
      if (initialResponse && !initialResponse.success && initialResponse.error) {
        finalResponse = {
          ...initialResponse,
          error: sanitizeErrorForDapp(initialResponse.error),
        };
      } else {
        finalResponse = initialResponse;
      }
    }

    // Send response back to page with correlation ID
    window.postMessage(
      {
        type: `${message.type}_RESPONSE`,
        source: EXTENSION_ID,
        requestId: message.requestId,
        payload: finalResponse,
      },
      window.location.origin
    );
  } catch (err) {
    window.postMessage(
      {
        type: `${message.type}_RESPONSE`,
        source: EXTENSION_ID,
        requestId: message.requestId,
        payload: { success: false, error: sanitizeErrorForDapp((err as Error).message) },
      },
      window.location.origin
    );
  }
});

// Inject the API into the page using external script (CSP-safe)
function injectAPI(): void {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('assets/page-api.js');
  script.onload = () => script.remove();
  document.documentElement.appendChild(script);
}

// Inject API when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', injectAPI);
} else {
  injectAPI();
}
