import { getUser } from '../db/users.js';
import { processPaymentScreenshot } from '../flows/payment.js';
import { appendMessage } from '../db/messages.js';

/**
 * Register the photo/document message handler.
 *
 * Only processes photos when the user is in "payment_pending" stage.
 * Delegates all logic to processPaymentScreenshot in the payment flow.
 *
 * @param {import('telegraf').Telegraf} bot
 */
export function registerPhotoHandler(bot) {
  bot.on(['photo', 'document'], async (ctx) => {
    const userId = ctx.from.id;

    try {
      // Get user from DB
      const user = await getUser(userId);
      if (!user) {
        return ctx.reply('Pehle /start kar ke register kar le yaar! 🙏');
      }

      // Always log the incoming photo turn before any failure point
      await appendMessage(userId, {
        role: 'user',
        text: '[photo]',
        stage: user.stage || 'unknown',
        source: 'user',
      });

      // Only process payment screenshots in payment_pending stage
      if (user.stage !== 'payment_pending') {
        const wrongStageReply =
          'Abhi photo processing ki zaroorat nahi hai 😊\n' +
          'Agar UPSC answer evaluate karwana hai toh paid course mein ye feature milega!';
        await ctx.reply(wrongStageReply);
        await appendMessage(userId, {
          role: 'bot',
          text: wrongStageReply,
          stage: user.stage || 'unknown',
          source: 'system',
        });
        return;
      }

      // Send acknowledgment immediately
      const ackReply = 'Checking your payment... ek second 🙏';
      await ctx.reply(ackReply);
      await appendMessage(userId, {
        role: 'bot',
        text: ackReply,
        stage: user.stage || 'unknown',
        source: 'system',
      });
      await ctx.sendChatAction('typing');

      // Get the selected course ID from user record
      const courseId = user.selectedCourseId || 'unknown';

      // Delegate to the payment flow (payment.js appends its own replies)
      await processPaymentScreenshot(ctx, user, courseId);

    } catch (err) {
      console.error(`[photo] Error for user ${userId}:`, err.message);
      await ctx.reply('Screenshot process nahi ho paya 😕 Dobara try kar na yaar!');
    }
  });
}
