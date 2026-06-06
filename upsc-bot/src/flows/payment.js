import axios from 'axios';
import { getCourse } from '../db/courses.js';
import { savePayment } from '../db/payments.js';
import { formatPrice } from '../utils/helpers.js';

/**
 * Hinglish reply sent to the user immediately after a screenshot is
 * received. Tells them verification is manual and gives a soft ETA.
 */
const WAIT_FOR_VERIFICATION_REPLY =
  'Screenshot mil gaya, thanks! 🙏 Hamari team isko verify kar rahi hai — thoda time lagega (kuch ghante max). Verify hote hi main tujhe ping karungi aur access bhi mil jayega. Tab tak kuch aur poochna ho toh bata!';

/**
 * Payment screenshot processing flow — manual verification path.
 *
 * 1. Download the photo URL from Telegram (we don't fetch the bytes — the
 *    URL embedding the bot token is enough for admin review).
 * 2. Save a `pending` payment record with the screenshot URL and no AI
 *    analysis (geminiAnalysis: null).
 * 3. Reply to the user with the wait-for-verification Hinglish message.
 * 4. Notify the admin so they can review and verify in the dashboard.
 *
 * AI vision verification was removed in Round 1 of the provider work — see
 * `src/ai/providers/gemini.js#verifyPaymentScreenshot` for the dormant
 * capability if a future "auto-verify" toggle wants to wire it back in.
 *
 * @param {import('telegraf').Context} ctx
 * @param {object} user - User document from Firestore
 * @param {string} courseId
 * @returns {Promise<void>}
 */
export async function processPaymentScreenshot(ctx, user, courseId) {
  const userId = user.telegramId;

  try {
    // ── 1. Get the file ID ─────────────────────────────────────────
    let fileId;
    if (ctx.message.photo) {
      const photos = ctx.message.photo;
      fileId = photos[photos.length - 1].file_id;
    } else if (ctx.message.document) {
      fileId = ctx.message.document.file_id;
    }

    if (!fileId) {
      await ctx.reply('Arre yaar, file nahi mila 😕 Dobara photo bhej na! 📸');
      return;
    }

    // ── 2. Get the screenshot URL ──────────────────────────────────
    const file = await ctx.telegram.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;

    console.log(`[payment] Received screenshot for user ${userId}: ${file.file_path}`);

    // ── 3. Look up the course ──────────────────────────────────────
    const course = await getCourse(courseId);
    const courseName = course?.name || 'Unknown Course';
    const coursePrice = course?.price || 0;

    // ── 4. Save payment record as pending (no AI verification) ─────
    const paymentId = await savePayment({
      telegramId: userId,
      courseId,
      screenshotUrl: fileUrl,
      geminiAnalysis: null,
    });

    if (!paymentId) {
      await ctx.reply('Arre sorry, payment save nahi ho paya 😥 Ek baar phir try kar!');
      return;
    }

    // ── 5. Tell the user we're reviewing ───────────────────────────
    await ctx.reply(WAIT_FOR_VERIFICATION_REPLY);
    console.log(`[payment] Saved payment ${paymentId} as pending for user ${userId}, course ${courseId}`);

    // ── 6. Notify admin so they can review in the dashboard ────────
    const adminId = process.env.ADMIN_TELEGRAM_ID;
    if (adminId) {
      const adminMsg = [
        `🔔 *New payment pending review*`,
        ``,
        `👤 User: ${user.name || 'Unknown'} (@${user.username || 'N/A'})`,
        `🆔 ID: ${userId}`,
        `📚 Course: ${courseName}`,
        `💰 Expected: ${formatPrice(coursePrice)}`,
        ``,
        `🧾 Payment ID: \`${paymentId}\``,
        `📸 Screenshot: ${fileUrl}`,
        ``,
        `Verify in the admin panel or here: /verify_${paymentId}`,
      ].join('\n');

      try {
        await ctx.telegram.sendMessage(adminId, adminMsg, { parse_mode: 'Markdown' });
        console.log(`[payment] Admin notified about pending payment ${paymentId}`);
      } catch (adminErr) {
        console.error('[payment] Failed to notify admin:', adminErr.message);
      }
    }
  } catch (err) {
    console.error(`[payment] processPaymentScreenshot error for user ${userId}:`, err.message);
    await ctx.reply(
      'Arre sorry yaar, screenshot process mein kuch gadbad ho gayi 😅\n' +
      'Ek baar phir se try kar — ya admin se contact kar! 🙏',
    );
  }
}
