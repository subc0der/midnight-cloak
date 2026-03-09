/**
 * Content script for Midnight Cloak extension
 *
 * Injected into web pages to enable communication between
 * dApps and the extension.
 *
 * Message flow:
 * dApp → window.postMessage → Content Script → chrome.runtime.sendMessage → Background
 */

const EXTENSION_ID = 'midnight-cloak';

interface MidnightCloakMessage {
  type: string;
  source: string;
  payload?: unknown;
}

// Listen for messages from the page
window.addEventListener('message', async (event) => {
  // Only accept messages from the same window
  if (event.source !== window) {
    return;
  }

  const message = event.data as MidnightCloakMessage;

  // Only process messages intended for us
  if (!message || message.source !== 'midnight-cloak-dapp') {
    return;
  }

  try {
    // Forward to background script
    const payload = (message.payload || {}) as Record<string, unknown>;
    const response = await chrome.runtime.sendMessage({
      type: message.type,
      ...payload,
    });

    // Send response back to page
    window.postMessage(
      {
        type: `${message.type}_RESPONSE`,
        source: EXTENSION_ID,
        payload: response,
      },
      '*'
    );
  } catch (err) {
    window.postMessage(
      {
        type: `${message.type}_RESPONSE`,
        source: EXTENSION_ID,
        payload: { success: false, error: (err as Error).message },
      },
      '*'
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
