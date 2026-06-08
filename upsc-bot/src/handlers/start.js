import { getUser, createUser, updateUser, updateStage } from '../db/users.js';

/**
 * Register the /start command handler.
 * - Creates or fetches the user in Firestore
 * - Sets stage to "new"
 * - Sends a short Hi greeting in the operator register
 *
 * @param {import('telegraf').Telegraf} bot
 */
export function registerStartHandler(bot) {
  bot.start(async (ctx) => {
    try {
      const { id, first_name, last_name, username } = ctx.from;
      const fullName = [first_name, last_name].filter(Boolean).join(' ');

      console.log(`[start] /start from ${id} (@${username || first_name})`);

      // Get or create user
      let user = await getUser(id);

      if (!user) {
        user = await createUser(id, {
          name: fullName,
          username: username || '',
        });
        console.log(`[start] New user created: ${id}`);
      } else {
        // Reset stage to "new" on /start (allows re-onboarding)
        await updateStage(id, 'new');
        await updateUser(id, { name: fullName, username: username || '' });
        console.log(`[start] Existing user reset to "new": ${id}`);
      }

      const welcomeText = 'Hi 👋';

      await ctx.reply(welcomeText);
    } catch (err) {
      console.error('[start] Error:', err.message);
      await ctx.reply('Arre kuch issue aa gaya bhai. /start phir try kar 🙏');
    }
  });
}
