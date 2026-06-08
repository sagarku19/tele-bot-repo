/**
 * Substitute {{key}} placeholders inside a template body.
 * Unknown placeholders are left as-is.
 *
 * @param {string} body
 * @param {Record<string,string>} vars
 * @returns {string}
 */
export function substitute(body, vars = {}) {
  if (!body) return '';
  return body.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : match;
  });
}

/**
 * Replace {{TEMPLATE:<key>}} markers in a Claude reply with the verbatim
 * template body from templates.json. The marker key is normalized to
 * lowercase before lookup, so {{TEMPLATE:Gift_Card_Notice}} resolves the
 * same as {{TEMPLATE:gift_card_notice}}. Keys MUST be stored lowercase
 * in templates.json. Unknown keys are left intact so the operator can
 * spot the misfire in the live chat.
 *
 * @param {string} reply
 * @param {Record<string,string>} templates
 * @returns {string}
 */
export function replaceMarkers(reply, templates = {}) {
  if (!reply) return '';
  return reply.replace(/\{\{TEMPLATE:([a-z0-9_]+)\}\}/gi, (match, key) => {
    const lookupKey = key.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(templates, lookupKey)) {
      return templates[lookupKey];
    }
    console.warn(`[training] unknown template marker: ${key}`);
    return match;
  });
}
