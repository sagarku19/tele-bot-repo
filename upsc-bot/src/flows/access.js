import { getCourse } from '../db/courses.js';
import { updateUser, updateStage } from '../db/users.js';

/**
 * Grant a user paid access to a course.
 *
 * 1. Fetch course from DB (channelId, groupId, welcomeMessage)
 * 2. Create single-use invite link for channel
 * 3. Create single-use invite link for group (if groupId exists)
 * 4. Send welcome message + invite links to user
 * 5. Update user: isPaid=true, add courseId to paidCourseIds, stage="paid"
 * 6. Notify admin
 *
 * @param {import('telegraf').Context} ctx - Telegraf context
 * @param {object} user - User document from Firestore
 * @param {string} courseId - The course to grant access to
 * @returns {Promise<boolean>} True if access was granted successfully
 */
export async function grantAccess(ctx, user, courseId) {
  const userId = user.telegramId;

  try {
    // ── 1. Get course details ──────────────────────────────────────
    const course = await getCourse(courseId);
    if (!course) {
      console.error(`[access] Course "${courseId}" not found`);
      await ctx.reply('Arre sorry, course nahi mila 😕 Admin se contact kar!');
      return false;
    }

    console.log(`[access] Granting access to user ${userId} for course: ${course.name}`);

    // ── 2. Create invite links ─────────────────────────────────────
    let channelLink = null;
    let groupLink = null;

    // Channel invite link
    if (course.channelId) {
      try {
        const channelInvite = await ctx.telegram.createChatInviteLink(course.channelId, {
          member_limit: 1,
          name: `${user.name || userId} - ${courseId}`,
        });
        channelLink = channelInvite.invite_link;
        console.log(`[access] Channel invite created: ${channelLink}`);
      } catch (err) {
        console.error(`[access] Failed to create channel invite for ${course.channelId}:`, err.message);
      }
    }

    // Group invite link (if groupId exists)
    if (course.groupId) {
      try {
        const groupInvite = await ctx.telegram.createChatInviteLink(course.groupId, {
          member_limit: 1,
          name: `${user.name || userId} - ${courseId}`,
        });
        groupLink = groupInvite.invite_link;
        console.log(`[access] Group invite created: ${groupLink}`);
      } catch (err) {
        console.error(`[access] Failed to create group invite for ${course.groupId}:`, err.message);
      }
    }

    // ── 3. Send welcome message + invite links to user ─────────────
    const welcomeLines = [
      `🎉🎉🎉 CONGRATULATIONS! 🎉🎉🎉`,
      ``,
      course.welcomeMessage || `Welcome to ${course.name}!`,
      ``,
    ];

    if (channelLink) {
      welcomeLines.push(`📢 *Course Channel:*`);
      welcomeLines.push(`${channelLink}`);
      welcomeLines.push(``);
    }

    if (groupLink) {
      welcomeLines.push(`💬 *Discussion Group:*`);
      welcomeLines.push(`${groupLink}`);
      welcomeLines.push(``);
    }

    welcomeLines.push(
      `⚡ Ye links sirf tere liye hain — single-use hai, jaldi join kar le!`,
      ``,
      `Ab tu mere se koi bhi UPSC question pooch sakta/sakti hai — main full detail mein help karungi! 💪`,
      `Chal, shuru karte hain! Koi question hai? 🚀`,
    );

    await ctx.reply(welcomeLines.join('\n'), { parse_mode: 'Markdown' });

    // ── 4. Update user in Firestore ────────────────────────────────
    const updatedCourseIds = [...(user.paidCourseIds || [])];
    if (!updatedCourseIds.includes(courseId)) {
      updatedCourseIds.push(courseId);
    }

    await updateUser(userId, {
      isPaid: true,
      paidCourseIds: updatedCourseIds,
    });

    await updateStage(userId, 'paid');

    console.log(`[access] ✅ User ${userId} is now PAID for course ${courseId}`);

    // ── 5. Notify admin ────────────────────────────────────────────
    const adminId = process.env.ADMIN_TELEGRAM_ID;
    if (adminId) {
      const adminMsg = [
        `🎉 *New Paid User!*`,
        ``,
        `👤 ${user.name || 'Unknown'} (@${user.username || 'N/A'})`,
        `🆔 ID: ${userId}`,
        `📚 Course: ${course.name} (${courseId})`,
        `💰 Price: ₹${course.price}`,
        ``,
        `✅ Access granted & stage set to "paid"`,
      ].join('\n');

      try {
        await ctx.telegram.sendMessage(adminId, adminMsg, { parse_mode: 'Markdown' });
      } catch (adminErr) {
        console.error('[access] Failed to notify admin:', adminErr.message);
      }
    }

    return true;

  } catch (err) {
    console.error(`[access] grantAccess error for user ${userId}, course ${courseId}:`, err.message);
    await ctx.reply(
      'Access grant karne mein thodi problem aa gayi 😕\n' +
      'Don\'t worry — admin manually fix kar dega. Thoda wait kar! 🙏'
    );
    return false;
  }
}
