/**
 * Anthropic Claude provider.
 *
 * Single AI provider for the bot. Exposes the same `chat()` signature the
 * legacy provider facade used so callers don't change shape.
 *
 * Env vars:
 *   - ANTHROPIC_API_KEY (required)
 *   - ANTHROPIC_MODEL   (optional; default 'claude-haiku-4-5')
 */

import Anthropic from '@anthropic-ai/sdk';
import { CHAT_FALLBACK_REPLY } from './constants.js';

const DEFAULT_MODEL_ID = 'claude-haiku-4-5';
const MAX_TOKENS = 1024;
const HISTORY_WINDOW = 10;

let client = null;
let modelId = null;

export function init() {
  if (client) return;

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('[claude] ANTHROPIC_API_KEY is not set!');
    return;
  }

  try {
    modelId = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL_ID;
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    console.log(`[claude] Initialized with ${modelId}`);
  } catch (err) {
    console.error('[claude] Initialization failed:', err.message);
  }
}

function getClient() {
  if (!client) init();
  return client;
}

function toAnthropicMessages(history, newMessage) {
  const recent = history.slice(-HISTORY_WINDOW);
  return [
    ...recent.map((m) => ({
      role: m.role === 'model' ? 'assistant' : 'user',
      content: m.text,
    })),
    { role: 'user', content: newMessage },
  ];
}

export async function chat(systemPrompt, conversationHistory = [], newMessage) {
  try {
    const c = getClient();
    if (!c) throw new Error('Anthropic client not initialized');

    const response = await c.messages.create({
      model: modelId,
      max_tokens: MAX_TOKENS,
      system: [
        {
          type: 'text',
          text: systemPrompt,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: toAnthropicMessages(conversationHistory, newMessage),
    });

    const block = response.content?.find?.((b) => b.type === 'text');
    const reply = block?.text;
    if (!reply || typeof reply !== 'string') {
      throw new Error('Empty or malformed response from Anthropic');
    }

    console.log(
      `[claude] Chat reply (${reply.length} chars) for: "${newMessage.substring(0, 40)}..."`,
    );
    return reply;
  } catch (err) {
    console.error('[claude] Chat error:', err.message);
    return CHAT_FALLBACK_REPLY;
  }
}
