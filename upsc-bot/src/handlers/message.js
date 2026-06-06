import { getUser, createUser, updateStage, updateUser } from '../db/users.js';
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

    // Ignore commands (they're handled by their own handlers)
    if (text.startsWith('/')) return;

    try {
      console.log(`[message] User ${id}: "${text.substring(0, 80)}"`);

      // Get or create user
      let user = await getUser(id);
      if (!user) {
        user = await createUser(id, {
          name: first_name || '',
          username: username || '',
        });
        console.log(`[message] Auto-created user ${id}`);
      }

      // Show typing indicator
      await ctx.sendChatAction('typing');

      // Process through conversation flow
      const { reply, newStage, selectedCourseId } = await processMessage(user, text);

      // Send the AI reply
      if (reply) {
        await ctx.reply(reply);
      }

      // Update stage if the flow says it changed
      if (newStage && newStage !== user.stage) {
        await updateStage(id, newStage);
        console.log(`[message] User ${id} stage: ${user.stage} → ${newStage}`);

        // If transitioning to payment_pending, also store the selected course
        if (newStage === 'payment_pending' && selectedCourseId) {
          await updateUser(id, { selectedCourseId });

          // Send payment instructions
          const course = await getCourse(selectedCourseId);
          if (course) {
            const paymentMsg = [
              `\n💳 *Payment Details:*`,
              `Course: ${course.name}`,
              `Amount: ${formatPrice(course.price)}`,
              ``,
              `UPI ya bank transfer karke screenshot bhej do yahan 📸`,
              `Main verify karke turant access de dunga! ⚡`,
            ].join('\n');
            await ctx.reply(paymentMsg, { parse_mode: 'Markdown' });
          }
        }
      }

      // Update name if stage was "new" and user just gave their name
      if (user.stage === 'new' && newStage === 'engaged') {
        // Use the message as their name if we don't have one
        if (!user.name || user.name === first_name) {
          const possibleName = text.trim().split('\n')[0].substring(0, 50);
          await updateUser(id, { name: possibleName });
          console.log(`[message] Updated name for ${id}: ${possibleName}`);
        }
      }

    } catch (err) {
      console.error(`[message] Error for user ${id}:`, err.message);
      await ctx.reply('Sorry, kuch gadbad ho gayi 😅 Please try again!');
    }
  });
}
