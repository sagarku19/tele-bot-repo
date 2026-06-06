import { getDb } from '../../config/firebase.js';

const COLLECTION = 'payments';

/**
 * Save a new payment record to Firestore.
 * @param {object} data - { telegramId, courseId, screenshotUrl, geminiAnalysis? }
 * @returns {Promise<string|null>} The created document ID, or null on failure.
 */
export async function savePayment(data) {
  try {
    const paymentData = {
      telegramId: String(data.telegramId),
      courseId: data.courseId,
      screenshotUrl: data.screenshotUrl || '',
      status: 'pending',
      geminiAnalysis: data.geminiAnalysis || null,
      verifiedAt: null,
      createdAt: new Date().toISOString(),
    };

    const docRef = await getDb().collection(COLLECTION).add(paymentData);
    console.log(`[payments] Saved payment ${docRef.id} for user ${data.telegramId}`);
    return docRef.id;
  } catch (err) {
    console.error(`[payments] savePayment failed:`, err.message);
    return null;
  }
}

/**
 * Get a payment record for a specific user and course.
 * Returns the most recent matching payment.
 * @param {number|string} telegramId
 * @param {string} courseId
 * @returns {Promise<object|null>}
 */
export async function getPayment(telegramId, courseId) {
  try {
    const snapshot = await getDb()
      .collection(COLLECTION)
      .where('telegramId', '==', String(telegramId))
      .where('courseId', '==', courseId)
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();

    if (snapshot.empty) return null;

    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() };
  } catch (err) {
    console.error(`[payments] getPayment(${telegramId}, ${courseId}) failed:`, err.message);
    return null;
  }
}

/**
 * Update the status (and optional analysis) of an existing payment.
 * @param {string} paymentId - Firestore document ID
 * @param {string} status - "pending" | "verified" | "rejected"
 * @param {string|null} [analysis] - Optional Gemini analysis text
 * @returns {Promise<boolean>} True if successful.
 */
export async function updatePaymentStatus(paymentId, status, analysis = null) {
  try {
    const updateData = {
      status,
      ...(analysis !== null && { geminiAnalysis: analysis }),
      ...(status === 'verified' && { verifiedAt: new Date().toISOString() }),
    };

    await getDb().collection(COLLECTION).doc(paymentId).update(updateData);
    console.log(`[payments] Payment ${paymentId} → ${status}`);
    return true;
  } catch (err) {
    console.error(`[payments] updatePaymentStatus(${paymentId}) failed:`, err.message);
    return false;
  }
}
