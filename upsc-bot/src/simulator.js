/**
 * Browser-based conversation simulator.
 *
 * Mounts on the bot's existing Express app at /sim when
 * ENABLE_SIMULATOR=true in the env. Provides a Telegram-styled chat UI
 * to drive `processMessage()` directly — no Telegram, no Firestore user
 * writes, ephemeral in-memory sessions only. Courses are still read from
 * Firestore (the `interested` stage needs the catalog).
 *
 * Routes:
 *  - GET  /sim            — chat UI (HTML)
 *  - POST /sim/message    — body: { sessionId, message } → runs processMessage
 *  - POST /sim/reset      — body: { sessionId, stage? } → resets session
 *
 * Safety: an inner middleware refuses any non-loopback request even if
 * the Express listener is mis-bound. Default to gated-off.
 */

import express from 'express';
import { processMessage } from './flows/conversation.js';

const VALID_STAGES = ['new', 'engaged', 'interested', 'payment_pending', 'paid'];

/** sessionId → fakeUser. Wiped on bot restart. */
const sessions = new Map();

function makeFakeUser(stage = 'new') {
  return {
    telegramId: 700000000 + Math.floor(Math.random() * 1000000),
    name: 'Sim User',
    username: 'sim',
    stage,
    isPaid: stage === 'paid',
    paidCourseIds: stage === 'paid' ? ['prelims-2026'] : [],
    selectedCourseId: null,
    createdAt: new Date().toISOString(),
    lastSeen: new Date().toISOString(),
  };
}

function getOrCreateUser(sessionId) {
  if (!sessions.has(sessionId)) sessions.set(sessionId, makeFakeUser('new'));
  return sessions.get(sessionId);
}

function isLoopback(req) {
  const ip = req.ip || req.socket?.remoteAddress || '';
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

export function registerSimulatorRoutes(app) {
  if (process.env.ENABLE_SIMULATOR !== 'true') {
    console.log('[sim] simulator disabled — set ENABLE_SIMULATOR=true to enable');
    return;
  }

  console.log('[sim] 🧪 simulator enabled at http://127.0.0.1:' + (process.env.PORT || 3000) + '/sim');

  // Defence-in-depth: even if someone binds the listener to 0.0.0.0,
  // refuse anything that isn't loopback.
  app.use('/sim', (req, res, next) => {
    if (!isLoopback(req)) return res.status(403).type('text').send('Forbidden: simulator is localhost-only');
    next();
  });

  app.get('/sim', (_req, res) => {
    res.type('html').send(HTML);
  });

  app.post('/sim/message', express.json(), async (req, res) => {
    try {
      const { sessionId, message } = req.body || {};
      if (!sessionId || typeof message !== 'string' || !message.trim()) {
        return res.status(400).json({ error: 'sessionId and non-empty message required' });
      }

      const user = getOrCreateUser(sessionId);
      const t0 = Date.now();
      const result = await processMessage(user, message);
      const ms = Date.now() - t0;

      if (result.newStage) user.stage = result.newStage;
      if (result.selectedCourseId) user.selectedCourseId = result.selectedCourseId;

      const isFallback = typeof result.reply === 'string' && result.reply.includes('technical issue aa gaya');

      res.json({
        reply: result.reply,
        stage: user.stage,
        selectedCourseId: user.selectedCourseId || null,
        newStage: result.newStage || null,
        ms,
        isFallback,
      });
    } catch (err) {
      console.error('[sim] /sim/message error:', err.message);
      res.status(500).json({ error: 'Internal error', detail: err.message });
    }
  });

  app.post('/sim/reset', express.json(), (req, res) => {
    const { sessionId, stage } = req.body || {};
    if (!sessionId) return res.status(400).json({ error: 'sessionId required' });
    const target = VALID_STAGES.includes(stage) ? stage : 'new';
    sessions.set(sessionId, makeFakeUser(target));
    res.json({ stage: target, selectedCourseId: null });
  });
}

// ─────────────────────────────────────────────────────────────────────
// Embedded UI — Telegram-styled chat. Vanilla HTML/CSS/JS, no build.
// ─────────────────────────────────────────────────────────────────────
const HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Priya · Simulator</title>
<style>
  * { box-sizing: border-box; }
  html, body { height: 100%; margin: 0; font-family: -apple-system, "Segoe UI", Roboto, sans-serif; color: #e1e1e1; }
  body { background: #0e1621; display: flex; }

  /* ── Chat column ── */
  .chat { flex: 1; display: flex; flex-direction: column; min-width: 0; }
  .chat header {
    background: #17212b; border-bottom: 1px solid #0a131e;
    padding: 12px 20px; display: flex; align-items: center; gap: 12px;
  }
  .avatar {
    width: 40px; height: 40px; border-radius: 50%;
    background: linear-gradient(135deg, #5288c1, #3b6fa3);
    display: flex; align-items: center; justify-content: center;
    font-weight: 600; color: white;
  }
  .chat header .title { font-weight: 600; font-size: 15px; color: #fff; }
  .chat header .subtitle { font-size: 12px; color: #708499; margin-top: 2px; }

  .messages {
    flex: 1; overflow-y: auto; padding: 16px 16% 16px 16%;
    background: #0e1621;
  }
  @media (max-width: 1100px) { .messages { padding: 16px 8% 16px 8%; } }
  @media (max-width: 700px)  { .messages { padding: 16px 4% 16px 4%; } }

  .msg { display: flex; margin: 6px 0; }
  .msg.user { justify-content: flex-end; }
  .bubble {
    max-width: 70%; padding: 8px 12px; border-radius: 14px;
    white-space: pre-wrap; word-wrap: break-word; font-size: 14.5px; line-height: 1.45;
    box-shadow: 0 1px 1px rgba(0,0,0,0.2);
  }
  .bubble.bot   { background: #182533; color: #e9eef4; border-bottom-left-radius: 4px; }
  .bubble.user  { background: #2b5278; color: #fff;    border-bottom-right-radius: 4px; }
  .bubble.fallback { background: #5a2d2d; color: #ffd7d7; }
  .meta { font-size: 11px; color: #708499; margin-top: 4px; }

  .typing {
    display: inline-block; padding: 8px 14px; background: #182533; color: #708499;
    border-radius: 14px; border-bottom-left-radius: 4px; font-size: 13px;
  }
  .typing .dot { display: inline-block; width: 5px; height: 5px; background: #708499; border-radius: 50%; margin: 0 1px; animation: blink 1.4s infinite both; }
  .typing .dot:nth-child(2) { animation-delay: 0.2s; }
  .typing .dot:nth-child(3) { animation-delay: 0.4s; }
  @keyframes blink { 0%, 80%, 100% { opacity: 0.3; } 40% { opacity: 1; } }

  /* ── Composer ── */
  .composer {
    background: #17212b; border-top: 1px solid #0a131e;
    padding: 10px 16% 10px 16%; display: flex; gap: 10px;
  }
  @media (max-width: 1100px) { .composer { padding: 10px 8%; } }
  @media (max-width: 700px)  { .composer { padding: 10px 4%; } }
  .composer textarea {
    flex: 1; background: #242f3d; color: #e1e1e1; border: none;
    border-radius: 12px; padding: 10px 14px; font: inherit; font-size: 14.5px;
    resize: none; min-height: 40px; max-height: 140px; outline: none;
  }
  .composer textarea:focus { background: #2a3645; }
  .composer button {
    background: #2b5278; color: white; border: none; border-radius: 12px;
    padding: 0 18px; cursor: pointer; font-weight: 600; font-size: 14px;
  }
  .composer button:disabled { opacity: 0.5; cursor: not-allowed; }
  .composer button:hover:not(:disabled) { background: #3a6691; }

  /* ── Sidebar ── */
  .side {
    width: 280px; background: #17212b; border-left: 1px solid #0a131e;
    display: flex; flex-direction: column; padding: 16px;
  }
  @media (max-width: 900px) { .side { display: none; } }
  .side h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; color: #708499; margin: 0 0 12px 0; font-weight: 600; }
  .stat { background: #242f3d; padding: 10px 12px; border-radius: 8px; margin-bottom: 8px; }
  .stat .label { font-size: 11px; color: #708499; text-transform: uppercase; letter-spacing: 0.5px; }
  .stat .value { font-size: 14px; color: #e1e1e1; margin-top: 4px; font-weight: 500; word-break: break-all; }

  .stage-badge {
    display: inline-block; padding: 3px 10px; border-radius: 10px;
    font-size: 12px; font-weight: 600;
  }
  .stage-new              { background: #4b5563; color: #e5e7eb; }
  .stage-engaged          { background: #1e3a8a; color: #bfdbfe; }
  .stage-interested       { background: #78350f; color: #fed7aa; }
  .stage-payment_pending  { background: #713f12; color: #fde68a; }
  .stage-paid             { background: #14532d; color: #bbf7d0; }

  .controls { margin-top: 16px; }
  .controls label { display: block; font-size: 12px; color: #708499; margin-bottom: 4px; }
  .controls select, .controls button {
    width: 100%; padding: 8px 12px; border-radius: 8px; border: none;
    background: #242f3d; color: #e1e1e1; font: inherit; font-size: 13px;
    margin-bottom: 8px; cursor: pointer;
  }
  .controls button { background: #2b5278; color: white; font-weight: 600; }
  .controls button:hover { background: #3a6691; }
  .controls button.danger { background: #5a2d2d; }
  .controls button.danger:hover { background: #7a3a3a; }

  .warn {
    background: #5a2d2d; color: #ffd7d7; padding: 8px 12px; border-radius: 6px;
    font-size: 12px; margin-bottom: 8px;
  }
</style>
</head>
<body>

<div class="chat">
  <header>
    <div class="avatar">P</div>
    <div>
      <div class="title">Priya · UPSC Mentor (simulator)</div>
      <div class="subtitle" id="subtitle">localhost only · ephemeral session</div>
    </div>
  </header>
  <div class="messages" id="messages"></div>
  <div class="composer">
    <textarea id="input" placeholder="Type a message…" rows="1"></textarea>
    <button id="send">Send</button>
  </div>
</div>

<aside class="side">
  <h2>Session state</h2>
  <div class="stat">
    <div class="label">Stage</div>
    <div class="value"><span id="stage-badge" class="stage-badge stage-new">new</span></div>
  </div>
  <div class="stat">
    <div class="label">Selected course</div>
    <div class="value" id="selected">—</div>
  </div>
  <div class="stat">
    <div class="label">Messages</div>
    <div class="value" id="msgcount">0</div>
  </div>
  <div class="stat">
    <div class="label">Last reply</div>
    <div class="value" id="lastlatency">—</div>
  </div>

  <div class="controls">
    <h2 style="margin-top: 12px;">Controls</h2>
    <label for="jumpstage">Jump to stage</label>
    <select id="jumpstage">
      <option value="new">new</option>
      <option value="engaged">engaged</option>
      <option value="interested">interested</option>
      <option value="payment_pending">payment_pending</option>
      <option value="paid">paid</option>
    </select>
    <button id="reset">Reset session to selected stage</button>
    <button id="newsession" class="danger">New session (new sessionId)</button>
  </div>
</aside>

<script>
(function () {
  const $msgs = document.getElementById('messages');
  const $input = document.getElementById('input');
  const $send = document.getElementById('send');
  const $stage = document.getElementById('stage-badge');
  const $selected = document.getElementById('selected');
  const $msgcount = document.getElementById('msgcount');
  const $lastlatency = document.getElementById('lastlatency');
  const $jump = document.getElementById('jumpstage');
  const $reset = document.getElementById('reset');
  const $newsession = document.getElementById('newsession');
  const $subtitle = document.getElementById('subtitle');

  // sessionId: persistent across reloads via localStorage. Wipes on bot restart.
  let sessionId = localStorage.getItem('sim_session_id');
  if (!sessionId) {
    sessionId = 'sim_' + Math.random().toString(36).slice(2, 12);
    localStorage.setItem('sim_session_id', sessionId);
  }
  $subtitle.textContent = 'localhost only · session ' + sessionId;

  let msgCount = 0;
  function bumpCount() { $msgcount.textContent = String(++msgCount); }
  function setStage(stage) {
    $stage.className = 'stage-badge stage-' + stage;
    $stage.textContent = stage;
  }
  function setSelected(id) { $selected.textContent = id || '—'; }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function addMessage(role, text, opts) {
    opts = opts || {};
    const row = document.createElement('div');
    row.className = 'msg ' + role;
    const bubble = document.createElement('div');
    bubble.className = 'bubble ' + role + (opts.fallback ? ' fallback' : '');
    bubble.textContent = text;
    row.appendChild(bubble);

    if (role === 'bot' && opts.meta) {
      const m = document.createElement('div');
      m.className = 'meta';
      m.style.marginLeft = '12px';
      m.textContent = opts.meta;
      bubble.appendChild(document.createElement('br'));
      bubble.appendChild(document.createTextNode(''));
      row.querySelector('.bubble').appendChild(m);
    }

    $msgs.appendChild(row);
    $msgs.scrollTop = $msgs.scrollHeight;
    return row;
  }

  function addTyping() {
    const row = document.createElement('div');
    row.className = 'msg bot';
    row.id = 'typing';
    row.innerHTML = '<div class="typing"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>';
    $msgs.appendChild(row);
    $msgs.scrollTop = $msgs.scrollHeight;
  }
  function removeTyping() {
    const t = document.getElementById('typing');
    if (t) t.remove();
  }

  async function send() {
    const text = $input.value.trim();
    if (!text) return;
    $input.value = '';
    $input.style.height = 'auto';
    $send.disabled = true;

    addMessage('user', text);
    bumpCount();
    addTyping();

    try {
      const r = await fetch('/sim/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, message: text }),
      });
      const data = await r.json();
      removeTyping();

      if (!r.ok) {
        addMessage('bot', '⚠️ ' + (data.error || ('HTTP ' + r.status)), { fallback: true });
      } else {
        const tag = data.isFallback ? ' (FALLBACK)' : '';
        addMessage('bot', data.reply, { fallback: data.isFallback, meta: data.ms + 'ms' + tag });
        bumpCount();
        setStage(data.stage);
        setSelected(data.selectedCourseId);
        $lastlatency.textContent = data.ms + ' ms' + (data.isFallback ? ' · ❌ fallback' : ' · ✅ real');
      }
    } catch (err) {
      removeTyping();
      addMessage('bot', '⚠️ Network error: ' + err.message, { fallback: true });
    } finally {
      $send.disabled = false;
      $input.focus();
    }
  }

  async function resetSession(stage) {
    try {
      const r = await fetch('/sim/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, stage }),
      });
      const data = await r.json();
      if (r.ok) {
        $msgs.innerHTML = '';
        msgCount = 0;
        $msgcount.textContent = '0';
        $lastlatency.textContent = '—';
        setStage(data.stage);
        setSelected(null);
        addMessage('bot', '— session reset to stage "' + data.stage + '" —', { meta: '' });
      }
    } catch (err) {
      addMessage('bot', '⚠️ Reset failed: ' + err.message, { fallback: true });
    }
  }

  // ── Wire events ──
  $send.addEventListener('click', send);
  $input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  });
  $input.addEventListener('input', () => {
    $input.style.height = 'auto';
    $input.style.height = Math.min($input.scrollHeight, 140) + 'px';
  });
  $reset.addEventListener('click', () => resetSession($jump.value));
  $newsession.addEventListener('click', () => {
    localStorage.removeItem('sim_session_id');
    location.reload();
  });

  addMessage('bot', "Welcome to the simulator. Type a message to chat with Priya. Use the sidebar to jump stages or start fresh.", { meta: 'system' });
  $input.focus();
})();
</script>
</body>
</html>`;
