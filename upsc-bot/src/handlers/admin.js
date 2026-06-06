import { isAdmin } from '../utils/helpers.js';
import { getAllUsers, getUser, updateStage, updateUser } from '../db/users.js';
import { updatePaymentStatus } from '../db/payments.js';

/**
 * Register admin-only command handlers.
 * All commands check ADMIN_TELEGRAM_ID before executing.
 *
 * Commands:
 *   /stats     → total users, paid users, today's new users
 *   /broadcast → send a message to all users
 *   /addcourse → instructions to add a course
 *   /listpaid  → list all paid users with their course
 *   /verify_<paymentId> → verify a payment and grant access
 *
 * @param {import('telegraf').Telegraf} bot
 */
export function registerAdminHandler(bot) {

  // ── /stats ────────────────────────────────────────────────────────
  bot.command('stats', async (ctx) => {
    if (!isAdmin(ctx.from.id)) {
      return ctx.reply('🚫 Admin-only command.');
    }

    try {
      const users = await getAllUsers();
      const totalUsers = users.length;
      const paidUsers = users.filter((u) => u.isPaid === true).length;

      // Today's new users (compare createdAt date)
      const today = new Date().toISOString().split('T')[0]; // "YYYY-MM-DD"
      const todayNew = users.filter((u) => u.createdAt && u.createdAt.startsWith(today)).length;

      // Stage breakdown
      const stageCounts = {};
      for (const u of users) {
        const s = u.stage || 'unknown';
        stageCounts[s] = (stageCounts[s] || 0) + 1;
      }
      const stageBreakdown = Object.entries(stageCounts)
        .map(([stage, count]) => `  • ${stage}: ${count}`)
        .join('\n');

      const uptimeSeconds = Math.floor(process.uptime());
      const hours = Math.floor(uptimeSeconds / 3600);
      const minutes = Math.floor((uptimeSeconds % 3600) / 60);

      const statsText = [
        `📊 *Bot Statistics*`,
        ``,
        `👥 Total users: ${totalUsers}`,
        `💰 Paid users: ${paidUsers}`,
        `🆕 Today's new users: ${todayNew}`,
        `⏱ Uptime: ${hours}h ${minutes}m`,
        ``,
        `📈 *Stage Breakdown:*`,
        stageBreakdown,
        ``,
        `🕐 ${new Date().toISOString()}`,
      ].join('\n');

      await ctx.reply(statsText, { parse_mode: 'Markdown' });
      console.log(`[admin] /stats requested`);
    } catch (err) {
      console.error('[admin] /stats error:', err.message);
      await ctx.reply('Failed to fetch stats.');
    }
  });

  // ── /broadcast <message> ──────────────────────────────────────────
  bot.command('broadcast', async (ctx) => {
    if (!isAdmin(ctx.from.id)) {
      return ctx.reply('🚫 Admin-only command.');
    }

    const message = ctx.message.text.replace(/^\/broadcast\s*/, '');
    if (!message) {
      return ctx.reply('Usage: /broadcast <message>');
    }

    try {
      const users = await getAllUsers();
      let sent = 0;
      let failed = 0;

      await ctx.reply(`📤 Broadcasting to ${users.length} users...`);

      for (const user of users) {
        try {
          await ctx.telegram.sendMessage(user.telegramId, message);
          sent++;
        } catch {
          failed++;
        }
      }

      await ctx.reply(`✅ Broadcast done: ${sent} sent, ${failed} failed.`);
      console.log(`[admin] Broadcast: ${sent} sent, ${failed} failed`);
    } catch (err) {
      console.error('[admin] /broadcast error:', err.message);
      await ctx.reply('Broadcast failed.');
    }
  });

  // ── /addcourse ────────────────────────────────────────────────────
  bot.command('addcourse', async (ctx) => {
    if (!isAdmin(ctx.from.id)) {
      return ctx.reply('🚫 Admin-only command.');
    }

    await ctx.reply(
      `📝 To add a new course:\n\n` +
      `1. Edit \`config/courses.config.js\`\n` +
      `2. Add a new course object with: id, name, description, price, channelId, groupId, welcomeMessage\n` +
      `3. Restart the bot\n\n` +
      `Courses are auto-seeded to Firestore on startup.`,
      { parse_mode: 'Markdown' },
    );
    console.log(`[admin] /addcourse requested`);
  });

  // ── /listpaid ─────────────────────────────────────────────────────
  bot.command('listpaid', async (ctx) => {
    if (!isAdmin(ctx.from.id)) {
      return ctx.reply('🚫 Admin-only command.');
    }

    try {
      const users = await getAllUsers();
      const paidUsers = users.filter((u) => u.isPaid === true);

      if (paidUsers.length === 0) {
        return ctx.reply('No paid users yet.');
      }

      const lines = paidUsers.map((u, i) => {
        const courses = u.paidCourseIds?.join(', ') || 'N/A';
        return `${i + 1}. ${u.name || 'Unknown'} (@${u.username || 'N/A'}) — ID: ${u.telegramId}\n   Courses: ${courses}`;
      });

      const text = `💰 *Paid Users (${paidUsers.length}):*\n\n${lines.join('\n\n')}`;
      await ctx.reply(text, { parse_mode: 'Markdown' });
      console.log(`[admin] /listpaid — ${paidUsers.length} paid users`);
    } catch (err) {
      console.error('[admin] /listpaid error:', err.message);
      await ctx.reply('Failed to fetch paid users.');
    }
  });

  // ── /verify_<paymentId> ───────────────────────────────────────────
  // Dynamic command to verify a payment — sent in the admin notification
  bot.hears(/^\/verify_(.+)$/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) {
      return ctx.reply('🚫 Admin-only command.');
    }

    const paymentId = ctx.match[1];

    try {
      // Update payment status to verified
      const success = await updatePaymentStatus(paymentId, 'verified');
      if (!success) {
        return ctx.reply(`❌ Payment ${paymentId} not found or update failed.`);
      }

      await ctx.reply(`✅ Payment \`${paymentId}\` verified!`, { parse_mode: 'Markdown' });
      console.log(`[admin] Payment ${paymentId} verified`);

      // TODO: In future, extract telegramId and courseId from the payment record
      // and call grantAccess + updateUser to mark them as paid.
      // For now the admin can manually grant access.

    } catch (err) {
      console.error(`[admin] /verify error:`, err.message);
      await ctx.reply('Verification failed.');
    }
  });
}
