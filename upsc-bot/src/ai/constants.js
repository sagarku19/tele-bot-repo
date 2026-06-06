/**
 * Shared constants for the AI layer.
 *
 * Kept provider-agnostic so every provider (Gemini, xAI, future Claude…)
 * returns the same fallback string when its real API call fails — that way
 * the bot's user-facing voice stays consistent regardless of which provider
 * is active, and tests have a single value to compare against.
 */

export const CHAT_FALLBACK_REPLY =
  'Arre yaar, abhi thoda technical issue aa gaya 😅 Ek minute mein dobara try kar na. Main yahan hoon! 🙏';
