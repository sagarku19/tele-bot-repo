/**
 * Strip Markdown emphasis (**bold** and *italic*) from a string.
 *
 * Telegram replies are sent as plain text (no parse_mode), so any leftover
 * asterisks from the model would render as literal characters. This is a
 * safety net — the real fix is the "no Markdown" rule in STAGE_PROMPTS.
 *
 * Unmatched single asterisks (e.g. "5 * 3") are left intact via lookbehind/
 * lookahead guards so we don't eat arithmetic.
 *
 * @param {string} text
 * @returns {string}
 */
export function stripEmphasis(text) {
  if (!text) return '';
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(?<![*\w])\*([^*\s][^*]*[^*\s]|[^*\s])\*(?![*\w])/g, '$1');
}
