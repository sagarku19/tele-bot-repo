/**
 * Simple logger with timestamps and level prefixes.
 * Usage: log('INFO', 'message', { optional: 'data' })
 */

/**
 * Log a message with a timestamp and level.
 * @param {'INFO'|'WARN'|'ERROR'} level
 * @param {string} message
 * @param {*} [data] - Optional data to print alongside the message
 */
export function log(level, message, data = undefined) {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level}]`;

  if (data !== undefined) {
    const dataStr = typeof data === 'object' ? JSON.stringify(data, null, 2) : data;
    if (level === 'ERROR') {
      console.error(`${prefix} ${message}`, dataStr);
    } else if (level === 'WARN') {
      console.warn(`${prefix} ${message}`, dataStr);
    } else {
      console.log(`${prefix} ${message}`, dataStr);
    }
  } else {
    if (level === 'ERROR') {
      console.error(`${prefix} ${message}`);
    } else if (level === 'WARN') {
      console.warn(`${prefix} ${message}`);
    } else {
      console.log(`${prefix} ${message}`);
    }
  }
}
