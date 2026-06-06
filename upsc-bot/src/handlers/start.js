import { getUser, createUser, updateUser, updateStage } from '../db/users.js';

/**
 * Register the /start command handler.
 * - Creates or fetches the user in Firestore
 * - Sets stage to "new"
 * - Sends a warm Hinglish welcome asking for name & attempt year
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

      const welcomeText = [
        `🙏 Namaste ${first_name}! Welcome to UPSC Bot! 🎯`,
        ``,
        `Main hoon aapka AI study buddy — UPSC preparation mein aapki puri help karunga! 💪`,
        ``,
        `Sabse pehle mujhe batao:`,
        `👤 Aapka naam kya hai?`,
        `📅 Aur UPSC ka konsa attempt hai — first time ya pehle bhi try kiya hai?`,
        ``,
        `Bas yeh do cheezein batao, phir hum shuru karte hain! 🚀`,
      ].join('\n');

      await ctx.reply(welcomeText);
    } catch (err) {
      console.error('[start] Error:', err.message);
      await ctx.reply('Oops! Kuch problem aa gayi. Please /start dobara try karein 🙏');
    }
  });
}
