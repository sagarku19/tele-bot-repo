import { getUser, createUser, updateStage, updateUser } from '../db/users.js';
import { appendMessage } from '../db/messages.js';
import { processMessage } from '../flows/conversation.js';
import { getCourse } from '../db/courses.js';
import { formatPrice } from '../utils/helpers.js';

/**
 * Register the catch-all text message handler.
 * Must be registered LAST so it doesn't shadow command handlers.
 *
 * Flow:
 * 1. Get user from DB (create if missing)
 * 2. Pass message + user to conversation flow
 * 3. Send AI reply
 * 4. Update stage if changed
 *
 * @param {import('telegraf').Telegraf} bot
 */
export function registerMessageHandler(bot) {
  bot.on('text', async (ctx) => {
    const { id, first_name, username } = ctx.from;
    const text = ctx.message.text;

    if (text.startsWith('/')) return;

    try {
      console.log(`[message] User ${id}: "${text.substring(0, 80)}"`);

      let user = await getUser(id);
      if (!user) {
        user = await createUser(id, {
          name: first_name || '',
          username: username || '',
        });
        console.log(`[message] Auto-created user ${id}`);
      }

      // Persist before processing — survives a Claude crash mid-turn
      await appendMessage(id, {
        role: 'user',
        text,
        stage: user.stage || 'new',
        source: 'user',
      });

      await ctx.sendChatAction('typing');

      const { reply, newStage, selectedCourseId, meta } = await processMessage(user, text);

      if (reply) {
        await ctx.reply(reply);
        await appendMessage(id, {
          role: 'bot',
          text: reply,
          stage: user.stage || 'new',
          source: meta?.source || 'claude',
          faqKey: meta?.faqKey,
          model: meta?.model,
        });
      }

      if (newStage && newStage !== user.stage) {
        await updateStage(id, newStage);
        console.log(`[message] User ${id} stage: ${user.stage} → ${newStage}`);

        if (newStage === 'payment_pending' && selectedCourseId) {
          await updateUser(id, { selectedCourseId });

          const course = await getCourse(selectedCourseId);
          if (course) {
            const paymentMsg = [
              `\n💳 Payment Details:`,
              `Course: ${course.name}`,
              `Amount: ${formatPrice(course.price)}`,
              ``,
              `Gift card ka screenshot bhej dijiye yahan 📸`,
              `Verify hote hi access mil jayega ⚡`,
            ].join('\n');
            await ctx.reply(paymentMsg);
            await appendMessage(id, {
              role: 'bot',
              text: paymentMsg,
              stage: newStage,
              source: 'system',
            });
          }
        }
      }
    } catch (err) {
      console.error(`[message] Error for user ${id}:`, err.message);
      await ctx.reply('Sorry, kuch gadbad ho gayi 😅 Please try again!');
    }
  });
}
