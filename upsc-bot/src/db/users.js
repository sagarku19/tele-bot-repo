import { getDb } from '../../config/firebase.js';

const COLLECTION = 'users';

/**
 * Get a user document by Telegram ID.
 * @param {number|string} telegramId
 * @returns {Promise<object|null>} The user data or null if not found.
 */
export async function getUser(telegramId) {
  try {
    const doc = await getDb().collection(COLLECTION).doc(String(telegramId)).get();
    return doc.exists ? { id: doc.id, ...doc.data() } : null;
  } catch (err) {
    console.error(`[users] getUser(${telegramId}) failed:`, err.message);
    return null;
  }
}

/**
 * Create a new user document in Firestore.
 * @param {number|string} telegramId
 * @param {object} data - { name, username, ... }
 * @returns {Promise<object|null>} The created user data or null on failure.
 */
export async function createUser(telegramId, data = {}) {
  try {
    const now = new Date().toISOString();
    const userData = {
      telegramId: Number(telegramId),
      name: data.name || '',
      username: data.username || '',
      stage: 'new',
      isPaid: false,
      paidCourseIds: [],
      createdAt: now,
      lastSeen: now,
    };

    await getDb().collection(COLLECTION).doc(String(telegramId)).set(userData);
    console.log(`[users] Created user ${telegramId}`);
    return userData;
  } catch (err) {
    console.error(`[users] createUser(${telegramId}) failed:`, err.message);
    return null;
  }
}

/**
 * Partial update of a user document.
 * Automatically bumps the lastSeen timestamp.
 * @param {number|string} telegramId
 * @param {object} data - Fields to merge.
 * @returns {Promise<boolean>} True if successful.
 */
export async function updateUser(telegramId, data) {
  try {
    await getDb()
      .collection(COLLECTION)
      .doc(String(telegramId))
      .update({
        ...data,
        lastSeen: new Date().toISOString(),
      });
    console.log(`[users] Updated user ${telegramId}`);
    return true;
  } catch (err) {
    console.error(`[users] updateUser(${telegramId}) failed:`, err.message);
    return false;
  }
}

/**
 * Update only the stage field for a user.
 * Valid stages: "new" → "engaged" → "interested" → "payment_pending" → "paid"
 * @param {number|string} telegramId
 * @param {string} stage
 * @returns {Promise<boolean>} True if successful.
 */
export async function updateStage(telegramId, stage) {
  try {
    await getDb()
      .collection(COLLECTION)
      .doc(String(telegramId))
      .update({
        stage,
        lastSeen: new Date().toISOString(),
      });
    console.log(`[users] User ${telegramId} stage → ${stage}`);
    return true;
  } catch (err) {
    console.error(`[users] updateStage(${telegramId}) failed:`, err.message);
    return false;
  }
}

/**
 * Return all user documents as an array.
 * @returns {Promise<object[]>}
 */
export async function getAllUsers() {
  try {
    const snapshot = await getDb().collection(COLLECTION).get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (err) {
    console.error('[users] getAllUsers failed:', err.message);
    return [];
  }
}
