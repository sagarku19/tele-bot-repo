/**
 * Firebase Admin SDK initialization
 * Shared configuration matching the UPSC bot's Firebase setup
 */
import admin from "firebase-admin";

let db = null;

function initFirebase() {
  if (admin.apps.length) return;

  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      }),
    });
    console.log('[Firebase] Initialized successfully');
  } catch (err) {
    console.error('[Firebase] Initialization failed:', err.message);
    throw err;
  }
}

export function getDb() {
  if (!db) {
    initFirebase();
    db = admin.firestore();
  }
  return db;
}

export { admin };
