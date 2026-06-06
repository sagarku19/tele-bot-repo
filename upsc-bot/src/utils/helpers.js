/**
 * Shared helper functions used across the bot.
 */

/**
 * Check whether a Telegram user ID matches the configured admin.
 * @param {number|string} userId
 * @returns {boolean}
 */
export function isAdmin(userId) {
  return String(userId) === String(process.env.ADMIN_TELEGRAM_ID);
}

/**
 * Escape special MarkdownV2 characters so Telegram renders the text correctly.
 * @param {string} text
 * @returns {string}
 */
export function escapeMarkdownV2(text) {
  return text.replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

/**
 * Format a price in INR with the ₹ symbol.
 * @param {number} amount
 * @returns {string}
 */
export function formatPrice(amount) {
  return `₹${amount.toLocaleString('en-IN')}`;
}

/**
 * Sleep for the given number of milliseconds.
 * @param {number} ms
 * @returns {Promise<void>}
 */
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Split an array into chunks of the given size.
 * Useful for batching broadcast messages to avoid rate limits.
 *
 * @param {Array} arr - The array to split
 * @param {number} size - Max items per chunk
 * @returns {Array<Array>} Array of chunks
 *
 * @example
 * chunkArray([1,2,3,4,5], 2) → [[1,2], [3,4], [5]]
 */
export function chunkArray(arr, size) {
  if (!arr || !arr.length || size <= 0) return [];
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

/**
 * Format a courses array into Hinglish readable text for bot messages.
 * Used when presenting courses to users inside Telegram.
 *
 * @param {Array<{ id: string, name: string, description: string, price: number }>} courses
 * @returns {string} Formatted course list text
 */
export function formatCourseList(courses) {
  if (!courses || courses.length === 0) {
    return 'Abhi koi course available nahi hai 😕';
  }

  return courses
    .map((c, i) => {
      const lines = [
        `${i + 1}. 📚 *${c.name}*`,
        `   ${c.description}`,
        `   💰 Price: ${formatPrice(c.price)}`,
        `   🆔 ID: \`${c.id}\``,
      ];
      return lines.join('\n');
    })
    .join('\n\n');
}
