import { getDb } from '../../config/firebase.js';

const COLLECTION = 'courses';

/**
 * Load the course catalog config — production by default, or the test
 * catalog when USE_TEST_COURSES=true. Dynamic import so the test file
 * is not loaded at all in production.
 * @returns {Promise<object[]>}
 */
async function loadCoursesConfig() {
  const useTest = process.env.USE_TEST_COURSES === 'true';
  const path = useTest
    ? '../../config/courses.test.config.js'
    : '../../config/courses.config.js';
  const { default: cfg } = await import(path);
  console.log(`[courses] Loaded ${useTest ? '🧪 TEST' : 'production'} catalog (${cfg.length} courses)`);
  return cfg;
}

/**
 * Fetch a single course by its ID.
 * @param {string} courseId
 * @returns {Promise<object|null>} The course data or null if not found.
 */
export async function getCourse(courseId) {
  try {
    const doc = await getDb().collection(COLLECTION).doc(courseId).get();
    return doc.exists ? { id: doc.id, ...doc.data() } : null;
  } catch (err) {
    console.error(`[courses] getCourse(${courseId}) failed:`, err.message);
    return null;
  }
}

/**
 * Return all courses from Firestore.
 * @returns {Promise<object[]>}
 */
export async function getAllCourses() {
  try {
    const snapshot = await getDb().collection(COLLECTION).get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (err) {
    console.error('[courses] getAllCourses failed:', err.message);
    return [];
  }
}

/**
 * Seed courses from courses.config.js into Firestore.
 * Upserts each course with merge:true so price/description edits land
 * on every boot (not just on first seed).
 * @returns {Promise<{inserted: number, updated: number}>}
 */
export async function seedCoursesFromConfig() {
  try {
    const db = getDb();
    const coursesConfig = await loadCoursesConfig();
    let inserted = 0;
    let updated = 0;

    for (const course of coursesConfig) {
      const ref = db.collection(COLLECTION).doc(course.id);
      const existing = await ref.get();

      if (existing.exists) {
        await ref.set(course, { merge: true });
        updated++;
        console.log(`[courses] Updated course: ${course.id}`);
      } else {
        await ref.set({
          ...course,
          createdAt: new Date().toISOString(),
        });
        inserted++;
        console.log(`[courses] Inserted course: ${course.id}`);
      }
    }

    console.log(`[courses] Seeding complete — ${inserted} new, ${updated} updated`);
    return { inserted, updated };
  } catch (err) {
    console.error('[courses] seedCoursesFromConfig failed:', err.message);
    return { inserted: 0, updated: 0 };
  }
}
