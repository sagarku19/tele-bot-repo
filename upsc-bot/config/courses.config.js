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
    id: 'combo-all-1499',
    name: 'All Coaching GS + Optional Combo',
    description: 'List 1 (All Coaching GS + optional) + List 2 (Delhi Top Faculty Package) + one optional subject of choice. Lifetime access. Updates till 2026 mains.',
    price: 1499,
    channelId: '<FILL_CHANNEL_ID>',
    groupId: '<FILL_GROUP_ID>',
    welcomeMessage: 'Welcome bhai 👍 Join karke explore karo. Updates milte rahenge.',
    kind: 'combo',
    pricing: { list: 1499, floor: 1499 },
  },
  {
    id: 'combo-list2-999',
    name: 'Delhi Top Faculty Package (List 2 only)',
    description: 'All subject Delhi Top Faculty Package — no optional. Lifetime access. Updates till 2026 mains.',
    price: 999,
    channelId: '<FILL_CHANNEL_ID>',
    groupId: '<FILL_GROUP_ID>',
    welcomeMessage: 'Welcome bhai 👍 List 2 access mil gaya.',
    kind: 'combo',
    pricing: { list: 999, floor: 999 },
  },
  {
    id: 'karandeep-anthropology',
    name: 'Karandeep Sir — Anthropology Optional',
    description: 'Karandeep Sir Anthropology Optional lectures + notes. ₹500 for old members of previous batch.',
    price: 650,
    channelId: '<FILL_CHANNEL_ID>',
    groupId: '<FILL_GROUP_ID>',
    welcomeMessage: 'Welcome to Karandeep Sir Anthropology batch 👍',
    kind: 'lecture',
    faculty: 'Karandeep',
    subject: 'Anthropology',
    pricing: { list: 650, oldMember: 500, floor: 500 },
  },
  {
    id: 'mrunal-economy',
    name: 'Mrunal Patel — Economy Batches',
    description: 'Mrunal Patel Economy lectures + notes.',
    price: 250,
    channelId: '<FILL_CHANNEL_ID>',
    groupId: '<FILL_GROUP_ID>',
    welcomeMessage: 'Welcome to Mrunal Sir Economy 👍',
    kind: 'lecture',
    faculty: 'Mrunal Patel',
    subject: 'Economy',
    pricing: { list: 250, floor: 250 },
  },
  {
    id: 'peeyush-ethics',
    name: 'Peeyush Sir — Ethics 2025',
    description: 'Peeyush Sir Ethics lectures + notes (2025).',
    price: 250,
    channelId: '<FILL_CHANNEL_ID>',
    groupId: '<FILL_GROUP_ID>',
    welcomeMessage: 'Welcome to Peeyush Sir Ethics 👍',
    kind: 'lecture',
    faculty: 'Peeyush',
    subject: 'Ethics',
    pricing: { list: 250, floor: 250 },
  },
  {
    id: 'peeyush-ethics-essay',
    name: 'Peeyush Sir — Ethics + Essay 2025',
    description: 'Peeyush Sir Ethics + Essay combined (2025) + notes.',
    price: 400,
    channelId: '<FILL_CHANNEL_ID>',
    groupId: '<FILL_GROUP_ID>',
    welcomeMessage: 'Welcome to Peeyush Sir Ethics + Essay 👍',
    kind: 'combo',
    faculty: 'Peeyush',
    subject: 'Ethics + Essay',
    pricing: { list: 400, floor: 400 },
  },
  {
    id: 'atish-mathur-gs2',
    name: 'Atish Mathur — GS2 (2025-26)',
    description: 'Atish Mathur GS2 lectures + notes (2025-26 session).',
    price: 300,
    channelId: '<FILL_CHANNEL_ID>',
    groupId: '<FILL_GROUP_ID>',
    welcomeMessage: 'Welcome to Atish Sir GS2 👍',
    kind: 'lecture',
    faculty: 'Atish Mathur',
    subject: 'GS2',
    pricing: { list: 300, floor: 300 },
  },
  {
    id: 'smriti-shah-society',
    name: 'Smriti Shah Maam — Society Classes (2026)',
    description: 'Smriti Shah Maam Society classes (2026 session).',
    price: 300,
    channelId: '<FILL_CHANNEL_ID>',
    groupId: '<FILL_GROUP_ID>',
    welcomeMessage: 'Welcome to Smriti Maam Society 👍',
    kind: 'lecture',
    faculty: 'Smriti Shah',
    subject: 'Society',
    pricing: { list: 300, floor: 300 },
  },
];

export default courses;
