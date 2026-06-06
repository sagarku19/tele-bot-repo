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
 * Only writes a document if it does not already exist (idempotent).
 * @returns {Promise<number>} Number of newly seeded courses.
 */
export async function seedCoursesFromConfig() {
  try {
    const db = getDb();
    const coursesConfig = await loadCoursesConfig();
    let seeded = 0;

    for (const course of coursesConfig) {
      const ref = db.collection(COLLECTION).doc(course.id);
      const doc = await ref.get();

      if (!doc.exists) {
        await ref.set({
          ...course,
          createdAt: new Date().toISOString(),
        });
        seeded++;
        console.log(`[courses] Seeded course: ${course.id}`);
      }
    }

    console.log(`[courses] Seeding complete — ${seeded} new, ${coursesConfig.length - seeded} already existed`);
    return seeded;
  } catch (err) {
    console.error('[courses] seedCoursesFromConfig failed:', err.message);
    return 0;
  }
}
