/**
 * Course configuration for the UPSC Bot.
 *
 * Required fields:
 *   - id, name, description, price, channelId, groupId, welcomeMessage
 *
 * Optional fields (added 2026-06-08 for /train):
 *   - kind: 'combo' | 'lecture' | 'optional'
 *   - faculty: string                       (e.g. "Karandeep")
 *   - subject: string                       (e.g. "Anthropology")
 *   - demoLink: string                      (Telegram demo invite URL)
 *   - pricing: { list, floor, oldMember }   (for negotiable courses; price still required)
 */
const courses = [
  {
    id: 'prelims-2026',
    name: 'UPSC Prelims 2026 Complete Course',
    description:
      'Comprehensive preparation for UPSC Prelims 2026 covering all subjects — History, Geography, Polity, Economy, Science & Environment, and Current Affairs with daily MCQ practice.',
    price: 4999,
    channelId: '@upsc_prelims_2026_channel',
    groupId: '@upsc_prelims_2026_group',
    welcomeMessage:
      '🎉 Welcome to the Prelims 2026 course! You now have access to daily MCQ sets, video lectures, and our exclusive discussion group. Start with the pinned resources!',
  },
  {
    id: 'mains-answer-writing',
    name: 'Mains Answer Writing Programme',
    description:
      'Master the art of UPSC Mains answer writing with daily practice questions, peer reviews, model answers by toppers, and personalized AI-powered feedback on your submissions.',
    price: 6999,
    channelId: '@upsc_mains_writing_channel',
    groupId: '@upsc_mains_writing_group',
    welcomeMessage:
      '🎉 Welcome to the Mains Answer Writing Programme! Submit your first answer today and receive AI-powered feedback within minutes. Check the pinned post for today\'s question.',
  },
  {
    id: 'current-affairs-monthly',
    name: 'Monthly Current Affairs Digest',
    description:
      'Stay ahead with curated monthly current affairs — daily news analysis, monthly compilations, topic-wise notes, and weekly quizzes to reinforce retention.',
    price: 999,
    channelId: '@upsc_current_affairs_channel',
    groupId: '@upsc_current_affairs_group',
    welcomeMessage:
      '🎉 Welcome to the Current Affairs Digest! You\'ll receive daily news briefs at 8 AM and weekly quizzes every Sunday. Check the pinned message for this month\'s compilation.',
  },
];

export default courses;
