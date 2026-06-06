/**
 * xAI (Grok) provider.
 *
 * Implements the provider interface used by ../index.js:
 *   - name: 'xai'
 *   - init()  → lazy, idempotent
 *   - chat(systemPrompt, history, newMessage) → Promise<string>
 *   - (no vision in Round 1 — verifyPaymentScreenshot is not implemented)
 *
 * xAI exposes an OpenAI-compatible REST API at https://api.x.ai/v1/. We use
 * raw fetch — no SDK — to keep dependencies thin.
 *
 * Env vars:
 *   - XAI_API_KEY (required when this provider is active)
 *   - XAI_MODEL   (optional; default 'grok-4-fast-non-reasoning')
 */

import { CHAT_FALLBACK_REPLY } from '../constants.js';

export const name = 'xai';

const DEFAULT_MODEL_ID = 'grok-4-fast-non-reasoning';
const API_URL = 'https://api.x.ai/v1/chat/completions';

let apiKey = null;
let modelId = null;

export function init() {
  if (apiKey) return;

  if (!process.env.XAI_API_KEY) {
    console.error('[xAI] XAI_API_KEY is not set!');
    return;
  }

  apiKey = process.env.XAI_API_KEY;
  modelId = process.env.XAI_MODEL || DEFAULT_MODEL_ID;
  console.log(`[xAI] Initialized with ${modelId}`);
}

/**
 * Translate the bot's `{role: 'user'|'model', text}` history into OpenAI's
 * `{role: 'user'|'assistant', content}` format.
 */
function toOpenAIMessages(systemPrompt, history, newMessage) {
  const recent = history.slice(-10);
  return [
    { role: 'system', content: systemPrompt },
    ...recent.map((m) => ({
      role: m.role === 'model' ? 'assistant' : 'user',
      content: m.text,
    })),
    { role: 'user', content: newMessage },
  ];
}

export async function chat(systemPrompt, conversationHistory = [], newMessage) {
  try {
    if (!apiKey) init();
    if (!apiKey) throw new Error('xAI not initialized — XAI_API_KEY missing');

    const messages = toOpenAIMessages(systemPrompt, conversationHistory, newMessage);

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: modelId, messages }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`HTTP ${response.status} ${response.statusText}: ${errText.slice(0, 200)}`);
    }

    const data = await response.json();
    const reply = data?.choices?.[0]?.message?.content;
    if (!reply || typeof reply !== 'string') {
      throw new Error('Empty or malformed response from xAI');
    }

    console.log(`[xAI] Chat reply (${reply.length} chars) for: "${newMessage.substring(0, 40)}..."`);
    return reply;
  } catch (err) {
    console.error('[xAI] Chat error:', err.message);
    return CHAT_FALLBACK_REPLY;
  }
}
