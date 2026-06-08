import { getDb } from '../../config/firebase.js';

const USERS = 'users';
const MESSAGES = 'messages';

/**
 * Append a message to a user's chat subcollection.
 * Append-only; never updates or deletes.
 *
 * @param {number|string} telegramId
 * @param {{role: 'user'|'bot', text: string, stage: string, source: 'user'|'claude'|'faq'|'template'|'system', faqKey?: string, model?: string}} msg
 * @returns {Promise<boolean>} true on success, false on failure (logs the error)
 */
export async function appendMessage(telegramId, msg) {
  try {
    const doc = {
      role: msg.role,
      text: msg.text ?? '',
      stage: msg.stage ?? 'unknown',
      source: msg.source ?? 'system',
      ts: new Date().toISOString(),
    };
    if (msg.faqKey) doc.faqKey = msg.faqKey;
    if (msg.model) doc.model = msg.model;

    await getDb()
      .collection(USERS)
      .doc(String(telegramId))
      .collection(MESSAGES)
      .add(doc);
    return true;
  } catch (err) {
    console.error(`[messages] appendMessage(${telegramId}) failed:`, err.message);
    return false;
  }
}

/**
 * Read messages for a user, newest-first.
 *
 * @param {number|string} telegramId
 * @param {{limit?: number, before?: string}} [opts] — before is an ISO timestamp; messages strictly older than that are returned
 * @returns {Promise<Array>} newest-first array of message docs (each includes id + fields)
 */
export async function getMessages(telegramId, opts = {}) {
  try {
    const { limit = 100, before } = opts;
    let q = getDb()
      .collection(USERS)
      .doc(String(telegramId))
      .collection(MESSAGES)
      .orderBy('ts', 'desc');
    if (before) q = q.where('ts', '<', before);
    q = q.limit(limit);
    const snap = await q.get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error(`[messages] getMessages(${telegramId}) failed:`, err.message);
    return [];
  }
}
