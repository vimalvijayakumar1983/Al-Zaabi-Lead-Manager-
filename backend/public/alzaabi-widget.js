/**
 * Al Zaabi CRM — Embeddable Lead Capture Widget
 *
 * Usage:
 *   <script
 *     src="https://YOUR_BACKEND/api/widget/alzaabi-widget.js"
 *     data-org-id="YOUR_ORGANIZATION_ID"
 *     data-division-id="OPTIONAL_DIVISION_ID"
 *     data-color="#0066FF"
 *     data-position="right"
 *     data-title="Get in Touch"
 *   ></script>
 */
(function () {
  'use strict';

  // ── Read config from the script tag ────────────────────────────────
  var scriptTag =
    document.currentScript ||
    (function () {
      var scripts = document.getElementsByTagName('script');
      return scripts[scripts.length - 1];
    })();

  var ORG_ID = scriptTag.getAttribute('data-org-id');
  if (!ORG_ID) {
    console.error('[Al Zaabi Widget] Missing data-org-id attribute');
    return;
  }

  var DIVISION_ID = scriptTag.getAttribute('data-division-id') || '';
  var BASE_URL = scriptTag.src.replace(/\/api\/widget\/alzaabi-widget\.js.*$/, '').replace(/\/widget\/alzaabi-widget\.js.*$/, '');
  var ENDPOINT = BASE_URL + '/api/channels/webchat/' + ORG_ID;
  var COLOR = scriptTag.getAttribute('data-color') || '#0066FF';
  var POSITION = scriptTag.getAttribute('data-position') || 'right';
  var TITLE = scriptTag.getAttribute('data-title') || 'Get in Touch';
  var WIDGET_ID = 'az-crm-widget-' + Math.random().toString(36).slice(2, 8);

  // ── Session ID for conversation tracking ───────────────────────────
  var SESSION_ID = (function () {
    var key = 'az_crm_session';
    var stored = null;
    try { stored = sessionStorage.getItem(key); } catch (e) { /* no-op */ }
    if (stored) return stored;
    var id = 'sess_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
    try { sessionStorage.setItem(key, id); } catch (e) { /* no-op */ }
    return id;
  })();

  // ── Inject styles ──────────────────────────────────────────────────
  var style = document.createElement('style');
  style.textContent = [
    '#' + WIDGET_ID + ' * { box-sizing:border-box; margin:0; padding:0; font-family:Inter,-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif; }',

    /* Floating button */
    '#' + WIDGET_ID + ' .az-fab { position:fixed; bottom:24px; ' + POSITION + ':24px; width:56px; height:56px; border-radius:50%; background:' + COLOR + '; color:#fff; border:none; cursor:pointer; box-shadow:0 4px 16px rgba(0,0,0,0.2); display:flex; align-items:center; justify-content:center; z-index:999999; transition:transform .2s,box-shadow .2s; }',
    '#' + WIDGET_ID + ' .az-fab:hover { transform:scale(1.08); box-shadow:0 6px 24px rgba(0,0,0,0.28); }',
    '#' + WIDGET_ID + ' .az-fab svg { width:26px; height:26px; }',

    /* Panel */
    '#' + WIDGET_ID + ' .az-panel { position:fixed; bottom:92px; ' + POSITION + ':24px; width:370px; max-width:calc(100vw - 32px); background:#fff; border-radius:16px; box-shadow:0 12px 48px rgba(0,0,0,0.18); z-index:999999; overflow:hidden; transform:translateY(16px); opacity:0; pointer-events:none; transition:transform .25s ease,opacity .25s ease; }',
    '#' + WIDGET_ID + ' .az-panel.az-open { transform:translateY(0); opacity:1; pointer-events:auto; }',

    /* Header */
    '#' + WIDGET_ID + ' .az-header { padding:20px 20px 16px; background:' + COLOR + '; color:#fff; }',
    '#' + WIDGET_ID + ' .az-header h3 { font-size:17px; font-weight:600; }',
    '#' + WIDGET_ID + ' .az-header p { font-size:13px; opacity:.85; margin-top:4px; }',

    /* Form body */
    '#' + WIDGET_ID + ' .az-body { padding:20px; max-height:420px; overflow-y:auto; }',
    '#' + WIDGET_ID + ' .az-field { margin-bottom:14px; }',
    '#' + WIDGET_ID + ' .az-field label { display:block; font-size:12px; font-weight:600; color:#475569; margin-bottom:4px; text-transform:uppercase; letter-spacing:.3px; }',
    '#' + WIDGET_ID + ' .az-field input, #' + WIDGET_ID + ' .az-field textarea { width:100%; padding:10px 12px; border:1.5px solid #e2e8f0; border-radius:8px; font-size:14px; color:#1e293b; transition:border-color .15s; outline:none; background:#fff; }',
    '#' + WIDGET_ID + ' .az-field input:focus, #' + WIDGET_ID + ' .az-field textarea:focus { border-color:' + COLOR + '; box-shadow:0 0 0 3px ' + COLOR + '22; }',
    '#' + WIDGET_ID + ' .az-field textarea { resize:vertical; min-height:70px; }',

    /* Button */
    '#' + WIDGET_ID + ' .az-btn { width:100%; padding:12px; background:' + COLOR + '; color:#fff; border:none; border-radius:8px; font-size:15px; font-weight:600; cursor:pointer; transition:opacity .15s; }',
    '#' + WIDGET_ID + ' .az-btn:hover { opacity:.92; }',
    '#' + WIDGET_ID + ' .az-btn:disabled { opacity:.5; cursor:not-allowed; }',

    /* Messages */
    '#' + WIDGET_ID + ' .az-msg { padding:12px; border-radius:8px; font-size:13px; margin-top:14px; line-height:1.5; }',
    '#' + WIDGET_ID + ' .az-msg.az-success { background:#f0fdf4; color:#166534; border:1px solid #bbf7d0; }',
    '#' + WIDGET_ID + ' .az-msg.az-error { background:#fef2f2; color:#991b1b; border:1px solid #fecaca; }',

    /* Powered-by */
    '#' + WIDGET_ID + ' .az-footer { padding:10px; text-align:center; font-size:11px; color:#94a3b8; border-top:1px solid #f1f5f9; }',

    /* Badge (unread count) */
    '#' + WIDGET_ID + ' .az-badge { position:absolute; top:-4px; right:-4px; width:20px; height:20px; border-radius:50%; background:#ef4444; color:#fff; font-size:11px; font-weight:700; display:flex; align-items:center; justify-content:center; }',
  ].join('\n');
  document.head.appendChild(style);

  // ── Build DOM ──────────────────────────────────────────────────────
  var root = document.createElement('div');
  root.id = WIDGET_ID;
  root.innerHTML = [
    /* FAB */
    '<button class="az-fab" aria-label="Open contact form">',
    '  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">',
    '    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    '  </svg>',
    '</button>',

    /* Panel */
    '<div class="az-panel">',
    '  <div class="az-header">',
    '    <h3>' + escapeHtml(TITLE) + '</h3>',
    '    <p>We typically reply within minutes</p>',
    '  </div>',
    '  <div class="az-body">',
    '    <form class="az-form">',
    '      <div class="az-field"><label>Name *</label><input name="name" required placeholder="Your full name" /></div>',
    '      <div class="az-field"><label>Email</label><input name="email" type="email" placeholder="you@example.com" /></div>',
    '      <div class="az-field"><label>Phone</label><input name="phone" type="tel" placeholder="+971 50 123 4567" /></div>',
    '      <div class="az-field"><label>Message *</label><textarea name="message" required placeholder="How can we help you?"></textarea></div>',
    '      <button type="submit" class="az-btn">Send Message</button>',
    '      <div class="az-msg" style="display:none"></div>',
    '    </form>',
    '  </div>',
    '  <div class="az-footer">Powered by Al Zaabi CRM</div>',
    '</div>',
  ].join('\n');
  document.body.appendChild(root);

  // ── Wire up interactions ───────────────────────────────────────────
  var fab = root.querySelector('.az-fab');
  var panel = root.querySelector('.az-panel');
  var form = root.querySelector('.az-form');
  var msgEl = root.querySelector('.az-msg');
  var isOpen = false;

  fab.addEventListener('click', function () {
    isOpen = !isOpen;
    panel.classList.toggle('az-open', isOpen);
    fab.innerHTML = isOpen
      ? '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
      : '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
  });

  // Close on Escape
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && isOpen) {
      isOpen = false;
      panel.classList.remove('az-open');
      fab.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
    }
  });

  // ── Form submission ────────────────────────────────────────────────
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var btn = form.querySelector('.az-btn');
    btn.disabled = true;
    btn.textContent = 'Sending...';
    msgEl.style.display = 'none';

    var data = {
      name: form.name.value.trim(),
      email: form.email.value.trim() || undefined,
      phone: form.phone.value.trim() || undefined,
      message: form.message.value.trim(),
      sessionId: SESSION_ID,
      divisionId: DIVISION_ID || undefined,
    };

    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
      .then(function (r) {
        return r.json().then(function (d) { return { ok: r.ok, data: d }; });
      })
      .then(function (res) {
        btn.disabled = false;
        btn.textContent = 'Send Message';
        if (res.ok && res.data.status === 'ok') {
          msgEl.className = 'az-msg az-success';
          msgEl.textContent = 'Thank you! We\'ll get back to you shortly.';
          msgEl.style.display = 'block';
          form.reset();
        } else {
          msgEl.className = 'az-msg az-error';
          msgEl.textContent = res.data.error || 'Something went wrong. Please try again.';
          msgEl.style.display = 'block';
        }
      })
      .catch(function () {
        btn.disabled = false;
        btn.textContent = 'Send Message';
        msgEl.className = 'az-msg az-error';
        msgEl.textContent = 'Network error. Please check your connection and try again.';
        msgEl.style.display = 'block';
      });
  });

  // ── Helpers ────────────────────────────────────────────────────────
  function escapeHtml(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }
})();
