import { chat } from '../ai/claude.js';
import { buildConversationPrompt } from '../ai/prompts.js';
import { getAllCourses } from '../db/courses.js';
import { formatPrice } from '../utils/helpers.js';

/**
 * In-memory conversation history per user.
 * Maps telegramId → Array<{ role: 'user'|'model', text: string }>
 */
const histories = new Map();

/**
 * Get or create conversation history for a user.
 * @param {number|string} telegramId
 * @returns {Array<{ role: string, text: string }>}
 */
function getHistory(telegramId) {
  const key = String(telegramId);
  if (!histories.has(key)) histories.set(key, []);
  return histories.get(key);
}

/**
 * Append a message to a user's conversation history.
 * @param {number|string} telegramId
 * @param {'user'|'model'} role
 * @param {string} text
 */
function pushHistory(telegramId, role, text) {
  const history = getHistory(telegramId);
  history.push({ role, text });
  // Cap at 20 total, chat() will further trim to last 10
  if (history.length > 20) history.splice(0, history.length - 20);
}

/**
 * The brain of the bot — processes a user message based on their current stage
 * and returns the AI reply + any stage transition.
 *
 * Stage flow: new → engaged → interested → payment_pending → paid
 *
 * @param {object} user - User document from Firestore
 * @param {string} messageText - The raw text message from the user
 * @returns {Promise<{ reply: string, newStage: string|null, selectedCourseId: string|null }>}
 */
export async function processMessage(user, messageText) {
  const stage = user.stage || 'new';
  const text = messageText.trim();
  const userId = user.telegramId;

  console.log(`[conversation] User ${userId} | stage: ${stage} | msg: "${text.substring(0, 50)}"`);

  try {
    const history = getHistory(userId);

    // ── Stage: NEW ─────────────────────────────────────────────────
    if (stage === 'new') {
      const systemPrompt = buildConversationPrompt('new', user, text);
      const reply = await chat(systemPrompt, history, text);

      pushHistory(userId, 'user', text);
      pushHistory(userId, 'model', reply);

      // Transition to "engaged" if message looks like a name / intro
      const looksLikeName = text.length >= 2 && !text.startsWith('/');
      return { reply, newStage: looksLikeName ? 'engaged' : null, selectedCourseId: null };
    }

    // ── Stage: ENGAGED ─────────────────────────────────────────────
    if (stage === 'engaged') {
      const systemPrompt = buildConversationPrompt('engaged', user, text);
      const reply = await chat(systemPrompt, history, text);

      pushHistory(userId, 'user', text);
      pushHistory(userId, 'model', reply);

      // Transition to "interested" on course-related keywords
      const interestKeywords = [
        'course', 'courses', 'price', 'pricing', 'fees', 'fee',
        'enroll', 'enrol', 'join', 'admission', 'subscribe',
        'kitna', 'paisa', 'cost', 'plan', 'plans',
        'batao', 'details', 'kya milega', 'syllabus',
        'haan', 'yes', 'sure', 'interested', 'bataiye',
        'dikha', 'dikhao', 'course batao', 'kya hai',
      ];
      const lowerText = text.toLowerCase();
      const showsInterest = interestKeywords.some((kw) => lowerText.includes(kw));

      return { reply, newStage: showsInterest ? 'interested' : null, selectedCourseId: null };
    }

    // ── Stage: INTERESTED ──────────────────────────────────────────
    if (stage === 'interested') {
      // Build formatted course catalog for the prompt
      const courses = await getAllCourses();
      let courseCatalog = 'Abhi koi course available nahi hai.';

      if (courses.length > 0) {
        courseCatalog = courses
          .map(
            (c, i) =>
              `${i + 1}. ${c.name} (ID: ${c.id})\n` +
              `   ${c.description}\n` +
              `   Price: ${formatPrice(c.price)}`,
          )
          .join('\n\n');
      }

      const systemPrompt = buildConversationPrompt('interested', user, text, courseCatalog);
      const reply = await chat(systemPrompt, history, text);

      pushHistory(userId, 'user', text);

      // Check if Gemini indicated a course selection
      const courseMatch = reply.match(/\[SELECTED_COURSE:(.+?)\]/);
      let selectedCourseId = null;
      let newStage = null;
      let cleanReply = reply;

      if (courseMatch) {
        selectedCourseId = courseMatch[1].trim();
        newStage = 'payment_pending';
        cleanReply = reply.replace(/\[SELECTED_COURSE:.+?\]/g, '').trim();
        console.log(`[conversation] Course selected: ${selectedCourseId}`);
      }

      pushHistory(userId, 'model', cleanReply);

      return { reply: cleanReply, newStage, selectedCourseId };
    }

    // ── Stage: PAYMENT_PENDING ─────────────────────────────────────
    if (stage === 'payment_pending') {
      const systemPrompt = buildConversationPrompt('payment_pending', user, text);
      const reply = await chat(systemPrompt, history, text);

      pushHistory(userId, 'user', text);
      pushHistory(userId, 'model', reply);

      // No text-based stage transition — only photo handler moves to "paid"
      return { reply, newStage: null, selectedCourseId: null };
    }

    // ── Stage: PAID ────────────────────────────────────────────────
    if (stage === 'paid') {
      const systemPrompt = buildConversationPrompt('paid', user, text);
      const reply = await chat(systemPrompt, history, text);

      pushHistory(userId, 'user', text);
      pushHistory(userId, 'model', reply);

      return { reply, newStage: null, selectedCourseId: null };
    }

    // ── Fallback ───────────────────────────────────────────────────
    console.warn(`[conversation] Unknown stage "${stage}" for user ${userId}`);
    const systemPrompt = buildConversationPrompt('engaged', user, text);
    const reply = await chat(systemPrompt, history, text);
    pushHistory(userId, 'user', text);
    pushHistory(userId, 'model', reply);
    return { reply, newStage: 'engaged', selectedCourseId: null };

  } catch (err) {
    console.error(`[conversation] Error for user ${userId}:`, err.message);
    return {
      reply: 'Arre sorry yaar! Kuch technical issue aa gaya 😅 Ek baar phir try kar na!',
      newStage: null,
      selectedCourseId: null,
    };
  }
}
