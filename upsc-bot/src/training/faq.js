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
 * Returns `{ key, reply }` on hit (so the caller can log which key matched),
 * or `null` if no key is found as a substring.
 *
 * @param {string} userMessage
 * @param {Record<string,string>} faq
 * @returns {{key: string, reply: string}|null}
 */
export function matchFaq(userMessage, faq) {
  if (!userMessage || !faq) return null;
  const haystack = normalize(userMessage);
  if (!haystack) return null;

  for (const [key, reply] of Object.entries(faq)) {
    const needle = normalize(key);
    if (needle && haystack.includes(needle)) {
      return { key, reply };
    }
  }
  return null;
}
