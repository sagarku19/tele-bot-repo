/**
 * AI provider facade.
 *
 * Callers (flows/conversation.js, flows/payment.js, test-local.js) import
 * `chat()` and `verifyPaymentScreenshot()` from here. The actual provider
 * is selected at runtime by the `AI_PROVIDER` env var ('gemini' | 'xai').
 *
 * Round-1 contract:
 *   - chat() routes to the active provider (defaults to Gemini).
 *   - verifyPaymentScreenshot() always routes to Gemini — the xAI provider
 *     does not implement vision yet (Round 3). flows/payment.js doesn't
 *     currently call this, but the capability is kept for future use.
 *   - initProviders() runs once at boot and inits the active provider.
 *   - Adding Claude / another provider later = import it here and add to
 *     REGISTRY; everything else just keeps working.
 */

import * as gemini from './gemini.js';
import * as xai from './xai.js';

const REGISTRY = {
  [gemini.name]: gemini,
  [xai.name]: xai,
};

const DEFAULT_PROVIDER = gemini.name;

export { CHAT_FALLBACK_REPLY } from '../constants.js';

/**
 * The name of the currently-active provider, honouring AI_PROVIDER but
 * falling back to the default if the env var is unset or names an unknown
 * provider.
 */
export function getActiveProviderName() {
  const requested = (process.env.AI_PROVIDER || '').toLowerCase();
  return REGISTRY[requested] ? requested : DEFAULT_PROVIDER;
}

/** The active provider's module. */
export function getActiveProvider() {
  return REGISTRY[getActiveProviderName()];
}

/**
 * Eagerly initialise the active provider. Safe to call once at boot;
 * individual provider chat() calls also self-init lazily as a safety net.
 */
export function initProviders() {
  const activeName = getActiveProviderName();
  REGISTRY[activeName].init?.();
  console.log(`[ai] Active provider: ${activeName}`);
}

/** Send a chat message via the active provider. */
export async function chat(systemPrompt, history, newMessage) {
  return getActiveProvider().chat(systemPrompt, history, newMessage);
}

/**
 * Verify a payment screenshot. Always routed to Gemini in Round 1
 * regardless of the active text provider — xAI vision is Round 3.
 *
 * Note: flows/payment.js no longer calls this in the active manual-review
 * flow; the capability is exported so a future "auto-verify" toggle can
 * call it directly.
 */
export async function verifyPaymentScreenshot(base64, mimeType) {
  return gemini.verifyPaymentScreenshot(base64, mimeType);
}
