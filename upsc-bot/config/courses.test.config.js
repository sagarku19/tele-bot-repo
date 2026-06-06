/**
 * TEST course catalog — loaded only when USE_TEST_COURSES=true in the env.
 *
 * Purpose: exercise the bot's catalog/pricing/stage flow with placeholder
 * data so production seeding (courses.config.js) is untouched.
 *
 * WARNINGS:
 * - Seeding still writes to the SAME Firestore project as production
 * (we don't have a separate test DB). The IDs below are prefixed
 * `test-` so they won't collide with real course documents, but they
 * DO persist as separate docs. Delete them manually from the Firestore
 * console when you're done, or use a separate Firebase project for
 * real isolation.
 * - channelId / groupId are placeholder @handles. They will NOT resolve
 * to real chats, so `grantAccess` will fail at `createChatInviteLink`
 * if a user reaches the paid stage. That's intentional — replace with
 * real chat IDs only if you want to test the full grant path, and
 * only against chats the bot is actually admin of.
 * - Edit the names/descriptions/prices below to suit whatever scenario
 * you're testing. This file is yours to maintain; the prod catalog
 * (courses.config.js) is the source of truth for real users.
 */
const testCourses = [
  {
    id: 'test-combo-1',
    name: 'All Coaching GS + Optional Combo (List 1)',
    description: 'Full GS Foundation packages (2025-2026) from major Delhi institutes: Vajiram & Ravi, Vision IAS, Saarthi IAS, Forum IAS, Sunya IAS, and Unacademy.',
    price: 999,
    channelId: '@test_combo_1_channel_placeholder',
    groupId: '@test_combo_1_group_placeholder',
    welcomeMessage: '🧪 Welcome to All Coaching GS Combo (List 1). Verified payment for the ₹999 tier.',
  },
  {
    id: 'test-combo-2',
    name: 'All Subject Delhi Top Faculty Package (List 2)',
    description: 'Subject-wise modules by top educators: Sudarshan Gurjar (Geo), Mrunal Patel (Eco), Atish Mathur (Polity), Prateek Nayak (History), Shivin Sir (S&T/Env), and more.',
    price: 999,
    channelId: '@test_combo_2_channel_placeholder',
    groupId: '@test_combo_2_group_placeholder',
    welcomeMessage: '🧪 Welcome to Delhi Top Faculty Package (List 2). Verified payment for the ₹999 tier.',
  },
  {
    id: 'test-mega-combo',
    name: 'Mega Full-Access Combo (List 1 + List 2 + 1 Optional)',
    description: 'Super bundle tier giving ultimate access to both List 1 and List 2 packages, along with any one Optional Subject of choice.',
    price: 1499,
    channelId: '@test_mega_combo_channel_placeholder',
    groupId: '@test_mega_combo_group_placeholder',
    welcomeMessage: '🧪 Welcome to the Mega Full-Access Combo. Verified payment for the ₹1499 tier.',
  },
  {
    id: 'test-optional-sociology',
    name: 'Sociology Optional Complete Pack',
    description: 'Includes Pranay Agarwal, Vision IAS, Sleepy Classes, Vikash Ranjan courses, answer writing workshops, and test discussions. Lifetime access + 1 year free updates.',
    price: 750,
    channelId: '@test_socio_channel_placeholder',
    groupId: '@test_socio_group_placeholder',
    welcomeMessage: '🧪 Welcome to Sociology Optional Pack. Verified payment for the ₹750 tier.',
  },
  {
    id: 'test-optional-anthropology',
    name: 'Anthropology Optional Complete Pack',
    description: 'Includes Karandeep Sir, Sunya IAS, Hima Bindu Mam, Answer Writing Enrichment programs, and Vajiram handouts. Lifetime access + 1 year free updates.',
    price: 750,
    channelId: '@test_anthro_channel_placeholder',
    groupId: '@test_anthro_group_placeholder',
    welcomeMessage: '🧪 Welcome to Anthropology Optional Pack. Verified payment for the ₹750 tier.',
  },
  {
    id: 'test-optional-geography',
    name: 'Geography Optional Complete Pack',
    description: 'Includes Saarthi IAS Himanshu Sir, Vision IAS, Shabbir Sir Enrichment, 500+ Answer Writing modules, and map analysis. Lifetime access + 1 year free updates.',
    price: 750,
    channelId: '@test_geo_opt_channel_placeholder',
    groupId: '@test_geo_opt_group_placeholder',
    welcomeMessage: '🧪 Welcome to Geography Optional Pack. Verified payment for the ₹750 tier.',
  },
  {
    id: 'test-adhoc-geo-env',
    name: 'Sudarshan Sir Geography + Environment Bundle',
    description: 'Targeted ad-hoc bundle including complete modules for Geography, Environment, and Disaster Management.',
    price: 400,
    channelId: '@test_adhoc_geo_channel_placeholder',
    groupId: '@test_adhoc_geo_group_placeholder',
    welcomeMessage: '🧪 Welcome to Sudarshan Sir\'s Geo + Env Single Track. Verified payment for the ₹400 tier.',
  },
  {
    id: 'test-adhoc-jayant-eco',
    name: 'Jayant Sir Economy Latest Module',
    description: 'Standalone checkout track for Jayant Sir\'s latest core Economy course framework.',
    price: 350,
    channelId: '@test_adhoc_eco_channel_placeholder',
    groupId: '@test_adhoc_eco_group_placeholder',
    welcomeMessage: '🧪 Welcome to Jayant Sir\'s Economy Single Track. Verified payment for the ₹350 tier.',
  }
];

export default testCourses;