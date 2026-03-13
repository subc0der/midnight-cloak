/**
 * Content script for Midnight Cloak extension
 *
 * Injected into web pages to enable communication between
 * dApps and the extension.
 *
 * Message flow:
 * dApp → window.postMessage → Content Script → chrome.runtime.sendMessage → Background
 *
 * Security features:
 * - Message type whitelist prevents unauthorized background access
 * - Request ID correlation prevents response spoofing
 * - Origin validation ensures messages come from same page
 */

const EXTENSION_ID = 'midnight-cloak';
const DAPP_SOURCE = 'midnight-cloak-dapp';

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
    const response = await chrome.runtime.sendMessage({
      ...payload,
      type: message.type, // Validated type always wins
    });

    // Send response back to page with correlation ID
    window.postMessage(
      {
        type: `${message.type}_RESPONSE`,
        source: EXTENSION_ID,
        requestId: message.requestId,
        payload: response,
      },
      window.location.origin
    );
  } catch (err) {
    window.postMessage(
      {
        type: `${message.type}_RESPONSE`,
        source: EXTENSION_ID,
        requestId: message.requestId,
        payload: { success: false, error: (err as Error).message },
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
