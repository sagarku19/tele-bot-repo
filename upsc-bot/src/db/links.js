import { getDb } from '../../config/firebase.js';

const COLLECTION = 'links';

/**
 * Return all links as a flat { name: url } map.
 * Used by the templates substitution chain to expand {{link}} / {{list1_link}}
 * placeholders inside template bodies at send time.
 *
 * @returns {Promise<Record<string, string>>}
 */
export async function getAllLinks() {
  try {
    const snap = await getDb().collection(COLLECTION).get();
    const out = {};
    for (const doc of snap.docs) {
      const data = doc.data();
      if (data?.url) out[doc.id] = data.url;
    }
    return out;
  } catch (err) {
    console.error('[links] getAllLinks failed:', err.message);
    return {};
  }
}
