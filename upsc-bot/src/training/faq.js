/**
 * Normalize a string for FAQ matching:
 * lowercase + strip punctuation + collapse whitespace.
 *
 * @param {string} s
 * @returns {string}
 */
function normalize(s) {
  return s
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Look for a confident FAQ hit in the user's message.
 * Returns the canned reply, or null if no key is found as a substring.
 *
 * @param {string} userMessage
 * @param {Record<string,string>} faq
 * @returns {string|null}
 */
export function matchFaq(userMessage, faq) {
  if (!userMessage || !faq) return null;
  const haystack = normalize(userMessage);
  if (!haystack) return null;

  for (const [key, reply] of Object.entries(faq)) {
    const needle = normalize(key);
    if (needle && haystack.includes(needle)) {
      return reply;
    }
  }
  return null;
}
