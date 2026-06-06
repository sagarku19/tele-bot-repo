/**
 * Gemini provider.
 *
 * Implements the provider interface used by ../index.js:
 *   - name: 'gemini'
 *   - init()  → lazy, idempotent
 *   - chat(systemPrompt, history, newMessage) → Promise<string>
 *   - verifyPaymentScreenshot(base64, mimeType) → Promise<{...}>
 *
 * Env vars:
 *   - GEMINI_API_KEY (required when this provider is active)
 *   - GEMINI_MODEL   (optional; default 'gemini-2.5-flash')
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { PAYMENT_VERIFICATION_PROMPT } from '../prompts.js';
import { CHAT_FALLBACK_REPLY } from '../constants.js';

export const name = 'gemini';

const DEFAULT_MODEL_ID = 'gemini-2.5-flash';

let genAI = null;
let model = null;
let modelId = null;

export function init() {
  if (genAI) return;

  if (!process.env.GEMINI_API_KEY) {
    console.error('[Gemini] GEMINI_API_KEY is not set!');
    return;
  }

  try {
    modelId = process.env.GEMINI_MODEL || DEFAULT_MODEL_ID;
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    model = genAI.getGenerativeModel({
      model: modelId,
      // Flash models (2.5+) default to thinking-on; disable for short conversational use.
      // Lite models ignore this silently — harmless.
      generationConfig: {
        thinkingConfig: { thinkingBudget: 0 },
      },
    });
    console.log(`[Gemini] Initialized with ${modelId} (thinking disabled)`);
  } catch (err) {
    console.error('[Gemini] Initialization failed:', err.message);
  }
}

function getModel() {
  if (!model) init();
  return model;
}

export async function chat(systemPrompt, conversationHistory = [], newMessage) {
  try {
    const m = getModel();
    if (!m) throw new Error('Model not initialized');

    const recentHistory = conversationHistory.slice(-10);

    const history = recentHistory.map((msg) => ({
      role: msg.role === 'model' ? 'model' : 'user',
      parts: [{ text: msg.text }],
    }));

    const chatSession = m.startChat({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      history,
    });

    const result = await chatSession.sendMessage(newMessage);
    const reply = result.response.text();

    console.log(`[Gemini] Chat reply (${reply.length} chars) for: "${newMessage.substring(0, 40)}..."`);
    return reply;
  } catch (err) {
    console.error('[Gemini] Chat error:', err.message);
    return CHAT_FALLBACK_REPLY;
  }
}

export async function verifyPaymentScreenshot(imageBase64, mimeType = 'image/jpeg') {
  const defaultResult = {
    isValid: false,
    amount: null,
    date: null,
    transactionId: null,
    confidence: 'low',
    isGiftCard: false,
    notes: 'Verification could not be completed',
  };

  try {
    const m = getModel();
    if (!m) throw new Error('Model not initialized');

    const imagePart = { inlineData: { data: imageBase64, mimeType } };

    const result = await m.generateContent([PAYMENT_VERIFICATION_PROMPT, imagePart]);
    const responseText = result.response.text();

    console.log(`[Gemini] Payment verification raw response: ${responseText.substring(0, 200)}`);

    const jsonMatch = responseText.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) {
      console.error('[Gemini] Could not parse JSON from verification response');
      return { ...defaultResult, notes: 'AI response was not in expected format' };
    }

    const parsed = JSON.parse(jsonMatch[0]);

    const verification = {
      isValid: Boolean(parsed.isValid),
      amount: parsed.amount !== undefined ? Number(parsed.amount) || null : null,
      date: parsed.date || null,
      transactionId: parsed.transactionId || null,
      confidence: parsed.confidence || 'low',
      isGiftCard: Boolean(parsed.isGiftCard),
      notes: parsed.notes || '',
    };

    console.log(`[Gemini] Payment verification result:`, JSON.stringify(verification));
    return verification;
  } catch (err) {
    console.error('[Gemini] Payment verification error:', err.message);
    return { ...defaultResult, notes: `Error: ${err.message}` };
  }
}
