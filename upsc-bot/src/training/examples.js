/**
 * Pick the top N few-shot examples for a given stage.
 * Filters by stage tag, then sorts by addedAt descending (newer first).
 * Examples without addedAt are sorted to the bottom.
 *
 * @param {Array<{stage: string, user: string, reply: string, addedAt?: string}>} pool
 * @param {string} stage
 * @param {number} n
 * @returns {Array}
 */
export function pickExamples(pool, stage, n = 3) {
  if (!Array.isArray(pool) || pool.length === 0) return [];
  const filtered = pool.filter((ex) => ex && ex.stage === stage);
  filtered.sort((a, b) => {
    const ad = a.addedAt || '';
    const bd = b.addedAt || '';
    if (ad === bd) return 0;
    return ad < bd ? 1 : -1;
  });
  return filtered.slice(0, n);
}

/**
 * Render an array of picked examples as a "Past real conversations" block
 * to be injected into the system prompt.
 *
 * @param {Array<{user: string, reply: string}>} examples
 * @returns {string}
 */
export function renderExamples(examples) {
  if (!Array.isArray(examples) || examples.length === 0) return '';
  const lines = ['--- Past real conversations (mimic this style) ---'];
  for (const ex of examples) {
    lines.push(`Student: ${ex.user}`);
    lines.push(`You: ${ex.reply}`);
    lines.push('');
  }
  return lines.join('\n');
}
