import axios from 'axios';
import { getCourse } from '../db/courses.js';
import { savePayment } from '../db/payments.js';
import { formatPrice } from '../utils/helpers.js';
import { appendMessage } from '../db/messages.js';

/**
 * Hinglish reply sent to the user immediately after a screenshot is
 * received. Tells them verification is manual and gives a soft ETA.
 */
const WAIT_FOR_VERIFICATION_REPLY =
  'Screenshot mil gaya, thanks! 🙏 Hamari team isko verify kar rahi hai — thoda time lagega (kuch ghante max). Verify hote hi main tujhe ping karungi aur access bhi mil jayega. Tab tak kuch aur poochna ho toh bata!';

/**
 * Payment screenshot processing flow — manual verification only.
 *
 * 1. Resolve the file ID from the Telegram message.
 * 2. Build the screenshot URL (admin reviews from there).
 * 3. Save a `pending` payment record.
 * 4. Reply to the user with the wait-for-verification Hinglish message.
 * 5. Notify the admin so they can verify in the dashboard.
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
      const noFileReply = 'Arre yaar, file nahi mila 😕 Dobara photo bhej na! 📸';
      await ctx.reply(noFileReply);
      await appendMessage(userId, {
        role: 'bot',
        text: noFileReply,
        stage: 'payment_pending',
        source: 'system',
      });
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

    // ── 4. Save payment record as pending ──────────────────────────
    const paymentId = await savePayment({
      telegramId: userId,
      courseId,
      screenshotUrl: fileUrl,
    });

    if (!paymentId) {
      const saveFailedReply = 'Arre sorry, payment save nahi ho paya 😥 Ek baar phir try kar!';
      await ctx.reply(saveFailedReply);
      await appendMessage(userId, {
        role: 'bot',
        text: saveFailedReply,
        stage: 'payment_pending',
        source: 'system',
      });
      return;
    }

    // ── 5. Tell the user we're reviewing ───────────────────────────
    await ctx.reply(WAIT_FOR_VERIFICATION_REPLY);
    await appendMessage(userId, {
      role: 'bot',
      text: WAIT_FOR_VERIFICATION_REPLY,
      stage: 'payment_pending',
      source: 'system',
    });
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
    const errorReply =
      'Arre sorry yaar, screenshot process mein kuch gadbad ho gayi 😅\n' +
      'Ek baar phir se try kar — ya admin se contact kar! 🙏';
    await ctx.reply(errorReply);
    await appendMessage(userId, {
      role: 'bot',
      text: errorReply,
      stage: 'payment_pending',
      source: 'system',
    });
  }
}
