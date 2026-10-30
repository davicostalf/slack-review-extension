(() => {
  const S = globalThis.SLACK_REVIEW_SELECTORS;
  const DEFAULTS = { myName: '', model: 'claude-sonnet-5-5', minChars: 15, timeoutSec: 30 };
  const CONTEXT_LIMIT = 15;
  const SAMPLES_LIMIT = 40;
  const LINK_WAIT_MS = 4000;
  const LINK_TEXT_MAX = 60; // a draft with less text than this, once URLs are removed, is carried by its link
  const LINK_MAX = 2;
  const SHIMMER_ACCENT = '#d97757';

  let bypass = false; // set while we resend a message ourselves
  let current = null; // { token, composer, original, timer }
  let tokenSeq = 0;

  const sel = (key) => S[key].join(',');
  const q = (root, key) => {
    for (const s of S[key]) {
      const el = root.querySelector(s);
      if (el) return el;
    }
    return null;
  };
  const isVisible = (el) => !!(el && (el.offsetParent || el.getClientRects().length));
  const norm = (t) => (t || '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
  const composerText = (c) => (c.innerText || '').replace(/ /g, ' ').replace(/\n+$/, '').trim();

  // Cached so the send decision can be made synchronously inside the event
  let opts = { ...DEFAULTS };
  async function getOptions() {
    try { opts = await chrome.storage.sync.get(DEFAULTS); } catch {}
    return opts;
  }
  getOptions();
  try { chrome.storage.onChanged.addListener(() => getOptions()); } catch {}

  // ---------- skip rules ----------
  function onlyEmojiOrLinks(text) {
    const rest = text
      .replace(/https?:\/\/\S+/g, '')
      .replace(/<[^>]+>/g, '')
      .replace(/:[a-z0-9_+\-]+:/gi, '')
      .replace(/[\p{Extended_Pictographic}‍️\s]/gu, '');
    return rest.length === 0;
  }

  // ---------- links ----------
  const URL_RE = /https?:\/\/[^\s<>"']+/g;
  const normUrl = (u) => { try { return new URL(u.replace(/[.,;:!?)\]}]+$/, '')).href; } catch { return ''; } };

  // URLs worth opening: only when the link carries the message
  function draftLinks(composer, text) {
    const found = [];
    for (const a of composer.querySelectorAll(sel('composerLink'))) {
      found.push(a.getAttribute('href') || a.getAttribute('data-stringify-link') || '');
    }
    for (const m of text.match(URL_RE) || []) found.push(m);
    const urls = Array.from(new Set(found.map(normUrl)))
      .filter((u) => u && SlackReviewLinks.isFetchableUrl(u))
      .slice(0, LINK_MAX);
    const rest = text.replace(URL_RE, '').replace(/\s+/g, ' ').trim();
    return rest.length < LINK_TEXT_MAX ? urls : [];
  }

  // Asks the background to open the links; gives up after LINK_WAIT_MS
  async function loadLinkInfo(urls) {
    if (!urls.length) return [];
    let timer;
    try {
      const res = await Promise.race([
        chrome.runtime.sendMessage({ type: 'link_info', urls }),
        new Promise((resolve) => { timer = setTimeout(() => resolve([]), LINK_WAIT_MS); })
      ]);
      return Array.isArray(res) ? res : [];
    } catch {
      return [];
    } finally {
      clearTimeout(timer);
    }
  }

  // ---------- context ----------
  function readContext(composer) {
    const pane = composer.closest(sel('threadPane')) || composer.closest(sel('mainPane')) || document;
    const nodes = Array.from(pane.querySelectorAll(sel('messageContainer'))).slice(-CONTEXT_LIMIT);
    const out = [];
    let lastAuthor = '';
    for (const n of nodes) {
      const a = q(n, 'sender');
      if (a && a.innerText.trim()) lastAuthor = a.innerText.trim();
      const t = q(n, 'messageText');
      const text = t ? t.innerText.trim() : '';
      if (text) out.push({ author: lastAuthor || '?', text: text.slice(0, 1500) });
    }
    return out;
  }

  async function getSamples(context, myName) {
    let stored = [];
    try { stored = (await chrome.storage.local.get({ samples: [] })).samples; } catch {}
    const mine = myName
      ? context.filter((m) => m.author.toLowerCase() === myName.toLowerCase()).map((m) => m.text)
      : [];
    return Array.from(new Set([...stored, ...mine])).slice(-SAMPLES_LIMIT);
  }

  async function saveSample(text) {
    try {
      const { samples } = await chrome.storage.local.get({ samples: [] });
      samples.push(text);
      await chrome.storage.local.set({ samples: samples.slice(-SAMPLES_LIMIT) });
    } catch {}
  }

  // ---------- editor manipulation ----------
  function selectAll(editor) {
    editor.focus();
    const r = document.createRange();
    r.selectNodeContents(editor);
    const s = getSelection();
    s.removeAllRanges();
    s.addRange(r);
  }

  // Returns true if the editor ended up containing the text.
  function replaceText(editor, text) {
    const matches = () => norm(editor.innerText) === norm(text);
    selectAll(editor);
    document.execCommand('insertText', false, text);
    if (matches()) return caretToEnd(editor);
    // Fallback: per-line insertText + insertParagraph
    selectAll(editor);
    document.execCommand('delete');
    text.split('\n').forEach((line, i) => {
      if (i > 0) document.execCommand('insertParagraph');
      if (line) document.execCommand('insertText', false, line);
    });
    return matches() && caretToEnd(editor);
  }

  function caretToEnd(editor) {
    const r = document.createRange();
    r.selectNodeContents(editor);
    r.collapse(false);
    const s = getSelection();
    s.removeAllRanges();
    s.addRange(r);
    return true;
  }

  function triggerSend(editor) {
    bypass = true;
    try {
      const btn = q(document, 'sendButton');
      if (btn && !btn.disabled) {
        btn.click();
      } else {
        editor.focus();
        editor.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true
        }));
      }
    } finally {
      setTimeout(() => { bypass = false; }, 0);
    }
  }

  const PLACEHOLDER = /⟨[^⟩]*⟩/;

  function sendText(editor, text, original, { skipPlaceholder = false } = {}) {
    if (!skipPlaceholder && PLACEHOLDER.test(text)) {
      clearCurrent();
      showNotice(editor, 'Preencha ou apague os trechos entre ⟨ ⟩ antes de enviar.');
      return;
    }
    clearCurrent();
    closeSession();
    saveSample(text);
    if (text !== original && !replaceText(editor, text)) {
      showToast(editor, 'Não consegui colocar o texto no campo. Mensagem não enviada.');
      return;
    }
    setTimeout(() => triggerSend(editor), 60);
  }

  // ---------- UI helpers ----------
  const BASE_CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; font-family: system-ui, -apple-system, sans-serif; }
    button { font: inherit; cursor: pointer; border-radius: 6px; padding: 5px 12px; border: 1px solid #8884; background: transparent; color: inherit; }
    button:disabled { cursor: default; opacity: .45; }
    button.primary { background: #1264a3; border-color: #1264a3; color: #fff; }
    button:focus-visible { outline: 2px solid #1d9bd1; outline-offset: 2px; }

    .pop { --bg: #fff; --fg: #1d1c1d; --muted: #6b6b6b; --line: #dddddd; --ins: rgba(18,100,163,.16); --warn: #e8912d33;
      position: fixed; z-index: 2147483646; display: flex; flex-direction: column; overflow: hidden;
      background: var(--bg); color: var(--fg); border: 1px solid var(--line); border-radius: 8px;
      box-shadow: 0 4px 16px rgba(0,0,0,.18); font-size: 14px; line-height: 1.45; }
    @media (prefers-color-scheme: dark) {
      .pop { --bg: #1a1d21; --fg: #d1d2d3; --muted: #9a9b9c; --line: #3d3f43; --ins: rgba(29,155,209,.25); box-shadow: 0 4px 16px rgba(0,0,0,.5); }
    }
    .pop-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 8px 4px 12px; }
    .pop-head h2 { margin: 0; font-size: 13px; font-weight: 700; }
    .pop-close { flex: none; width: 28px; height: 28px; padding: 0; display: inline-flex; align-items: center; justify-content: center;
      border: 0; border-radius: 6px; font-size: 20px; line-height: 1; }
    .pop-close:hover { background: var(--line); }
    .pop-body { overflow: auto; padding: 0 12px 8px; min-height: 0; }
    .reason { margin: 0 0 8px; font-size: 12px; color: var(--muted); }
    .diff { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; user-select: text; cursor: text; }
    del { color: var(--muted); text-decoration: line-through; }
    ins { background: var(--ins); text-decoration: underline; text-underline-offset: 2px; }
    .hunk { border-radius: 4px; }
    .hunk:hover, .hunk:focus-within { outline: 1px dashed var(--line); outline-offset: 1px; }
    .hunk .apply { margin-left: 4px; padding: 0 8px; font-size: 11px; line-height: 18px; user-select: none; vertical-align: baseline;
      opacity: 0; }
    .hunk:hover .apply, .hunk:focus-within .apply, .hunk .apply:focus-visible { opacity: 1; }
    .hunk.applied ins { text-decoration: none; }
    .hunk .done { margin-left: 4px; font-size: 11px; color: var(--muted); user-select: none; }
    .msg { margin: 0; padding: 0 12px 8px; font-size: 13px; overflow-wrap: anywhere; }
    .note { margin: 8px 12px 0; padding: 6px 8px; border-radius: 6px; font-size: 12px; background: var(--warn); }
    .pop-foot { display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap; padding: 8px 12px; border-top: 1px solid var(--line); }
    .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  `;

  function makeHost() {
    const host = document.createElement('div');
    const root = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = BASE_CSS;
    root.appendChild(style);
    document.documentElement.appendChild(host);
    return { host, root };
  }

  function el(tag, props = {}, children = []) {
    const e = document.createElement(tag);
    Object.assign(e, props);
    for (const c of children) e.append(c);
    return e;
  }

  // Same look as the suggestion popover; anchored above the composer
  function anchor(pop, composer) {
    const place = () => {
      if (!composer.isConnected) return;
      const box = composer.closest(sel('composerBox')) || composer;
      const r = box.getBoundingClientRect();
      const gap = 8;
      const cap = window.innerHeight * 0.4;
      const above = r.top - gap - 8;
      const below = window.innerHeight - r.bottom - gap - 8;
      const flip = above < 140 && below > above;
      pop.style.left = Math.max(8, r.left) + 'px';
      pop.style.width = Math.min(Math.max(r.width, 280), window.innerWidth - 16) + 'px';
      pop.style.maxHeight = Math.max(100, Math.min(cap, flip ? below : above)) + 'px';
      if (flip) { pop.style.top = r.bottom + gap + 'px'; pop.style.bottom = ''; }
      else { pop.style.bottom = window.innerHeight - r.top + gap + 'px'; pop.style.top = ''; }
    };
    const ro = new ResizeObserver(place);
    ro.observe(composer.closest(sel('composerBox')) || composer);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    place();
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }

  // Buttons must not pull focus out of the composer
  function keepComposerFocus(pop) {
    pop.addEventListener('mousedown', (e) => { if (e.target.closest && e.target.closest('button')) e.preventDefault(); });
    for (const t of ['keydown', 'keyup', 'keypress']) {
      pop.addEventListener(t, (e) => { if (e.key !== 'Escape') e.stopPropagation(); });
    }
  }

  // One notice or error at a time: { host, owner, timer, cleanup }
  let bubble = null;

  function closeBubble() {
    if (!bubble) return;
    const b = bubble;
    bubble = null;
    clearTimeout(b.timer);
    b.cleanup();
    b.host.remove();
  }

  function showBubble(composer, { title, message, actions = [], dismissMs = 0, owner = null, onClose }) {
    closeBubble();
    const { host, root } = makeHost();
    const pop = el('div', { className: 'pop' });
    pop.setAttribute('role', owner ? 'alert' : 'status');
    const closeBtn = el('button', { type: 'button', className: 'pop-close', textContent: '×', title: 'Fechar' });
    closeBtn.setAttribute('aria-label', 'Fechar aviso');
    closeBtn.addEventListener('click', () => { closeBubble(); if (onClose) onClose(); });
    pop.append(el('div', { className: 'pop-head' }, [el('h2', { textContent: title }), closeBtn]));
    pop.append(el('div', { className: 'pop-body' }, [el('p', { className: 'msg', textContent: message })]));
    if (actions.length) {
      const foot = el('div', { className: 'pop-foot' });
      for (const a of actions) {
        const b = el('button', { type: 'button', className: a.primary ? 'primary' : '', textContent: a.label });
        b.addEventListener('click', a.onClick);
        foot.append(b);
      }
      pop.append(foot);
    }
    root.appendChild(pop);
    keepComposerFocus(pop);
    const stop = anchor(pop, composer);
    bubble = { host, owner, cleanup: stop, timer: dismissMs ? setTimeout(closeBubble, dismissMs) : null };
  }

  const showToast = (composer, msg) => showBubble(composer, { title: 'Não deu certo', message: msg, dismissMs: 5000 });
  const showNotice = (composer, msg) => showBubble(composer, { title: 'Falta preencher', message: msg, dismissMs: 4000 });

  // ---------- in-place "reviewing" shimmer ----------
  // The composer text itself animates while a review runs. The attribute is
  // the only thing we touch on Slack's DOM; one <style> does the rest.
  const SHIMMER_CSS = `
    @keyframes claude-shimmer { from { background-position: 100% 0; } to { background-position: -100% 0; } }
    [data-claude-reviewing] {
      background: linear-gradient(90deg, var(--claude-fg) 0%, ${SHIMMER_ACCENT} 40%, var(--claude-fg) 80%) 0 0 / 200% 100%;
      background-repeat: repeat-x;
      -webkit-background-clip: text; background-clip: text;
      animation: claude-shimmer 1.4s linear infinite;
      caret-color: var(--claude-fg);
    }
    [data-claude-reviewing], [data-claude-reviewing] * { color: transparent !important; -webkit-text-fill-color: transparent !important; }
    [data-claude-reviewing] * { background: none !important; }
    @media (prefers-reduced-motion: reduce) {
      [data-claude-reviewing] { animation: none; background: none; }
      [data-claude-reviewing], [data-claude-reviewing] * {
        color: color-mix(in srgb, var(--claude-fg) 65%, ${SHIMMER_ACCENT}) !important;
        -webkit-text-fill-color: color-mix(in srgb, var(--claude-fg) 65%, ${SHIMMER_ACCENT}) !important;
      }
    }
  `;

  function ensureShimmerStyle() {
    if (document.getElementById('claude-review-style')) return;
    const st = document.createElement('style');
    st.id = 'claude-review-style';
    st.textContent = SHIMMER_CSS;
    (document.head || document.documentElement).appendChild(st);
  }

  function startShimmer(cur) {
    ensureShimmerStyle();
    const c = cur.composer;
    // Base color is the text's own color, read before it turns transparent
    c.style.setProperty('--claude-fg', getComputedStyle(c).color);
    c.setAttribute('data-claude-reviewing', '');
    const { host, root } = makeHost();
    const live = el('div', { className: 'sr' });
    live.setAttribute('aria-live', 'polite');
    root.appendChild(live);
    setTimeout(() => { live.textContent = 'Revisando a mensagem'; }, 50);
    cur.live = host;
    // Safety net: never leave the text transparent if a path forgets to stop it
    cur.safety = setTimeout(() => stopShimmer(cur), opts.timeoutSec * 1000 + 2000);
  }

  // Idempotent; called from every exit path
  function stopShimmer(cur) {
    clearTimeout(cur.safety);
    if (cur.live) { cur.live.remove(); cur.live = null; }
    cur.composer.removeAttribute('data-claude-reviewing');
    cur.composer.style.removeProperty('--claude-fg');
  }

  function clearCurrent() {
    if (!current) return;
    const cur = current;
    current = null;
    cur.token = -1;
    clearTimeout(cur.timer);
    clearInterval(cur.poll);
    if (cur.observer) cur.observer.disconnect();
    stopShimmer(cur);
    if (bubble && bubble.owner === cur) closeBubble();
  }

  // ---------- suggestion session + popover ----------
  // Lives from the first popover until the composer is sent, emptied or removed.
  // `insisted` is the normalized text whose review produced the suggestion:
  // sending exactly that text again goes straight through (no review loop).
  let session = null; // { composer, reviewed, observer, timer, pop }

  function closeSession() {
    if (!session) return;
    const s = session;
    session = null;
    s.observer.disconnect();
    clearInterval(s.timer);
    if (s.pop) destroyPopover(s.pop);
  }

  function closePopover() {
    if (session && session.pop) {
      destroyPopover(session.pop);
      session.pop = null;
    }
  }

  function destroyPopover(pop) {
    pop.cleanup();
    pop.host.remove();
  }

  function startSession(composer) {
    if (session && session.composer === composer) return session;
    closeSession();
    const s = { composer, insisted: '', observer: null, timer: null, pop: null };
    s.observer = new MutationObserver(() => {
      if (session !== s) return;
      if (!composer.isConnected || !composerText(composer)) return closeSession();
      if (s.pop) s.pop.sync();
    });
    s.observer.observe(composer, { childList: true, subtree: true, characterData: true });
    // Channel switch can detach the composer without a mutation inside it
    s.timer = setInterval(() => { if (!composer.isConnected) closeSession(); }, 500);
    session = s;
    return s;
  }

  function placeCaretAtEnd(editor) {
    editor.focus();
    const r = document.createRange();
    r.selectNodeContents(editor);
    r.collapse(false);
    const s = getSelection();
    s.removeAllRanges();
    s.addRange(r);
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return Promise.reject(new Error('no clipboard'));
  }

  function openPopover(composer, { original, suggestion, reason, hasEntities }) {
    const s = startSession(composer);
    closePopover();
    s.insisted = norm(original);

    const segs = SlackReviewDiff.diff(original, suggestion);
    const applied = new Set();
    let expected = original; // what the composer should hold for hunks to stay applicable

    const { host, root } = makeHost();
    const pop = el('div', { className: 'pop' });
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', 'Sugestão do Claude');

    const closeBtn = el('button', { type: 'button', className: 'pop-close', textContent: '×', title: 'Fechar (Esc)' });
    closeBtn.setAttribute('aria-label', 'Fechar sugestão');
    const head = el('div', { className: 'pop-head' }, [el('h2', { textContent: 'Sugestão do Claude' }), closeBtn]);
    const body = el('div', { className: 'pop-body' });
    const stale = el('p', { className: 'note', hidden: true, textContent: 'O texto mudou; use Substituir tudo ou copie' });
    const replaceBtn = el('button', { type: 'button', className: 'primary', textContent: 'Substituir tudo' });
    const copyBtn = el('button', { type: 'button', textContent: 'Copiar' });
    const foot = el('div', { className: 'pop-foot' }, [copyBtn, replaceBtn]);
    const live = el('div', { className: 'sr' });
    live.setAttribute('aria-live', 'polite');
    pop.append(head, body);
    if (hasEntities) {
      pop.append(el('p', {
        className: 'note',
        textContent: 'Sua mensagem tem menções ou canais. Texto simples perde as menções reais: confira e refaça as menções depois de substituir.'
      }));
    }
    pop.append(stale, foot, live);
    root.appendChild(pop);

    const isStale = () => norm(composerText(composer)) !== norm(expected);

    const writeComposer = (text) => {
      expected = text;
      if (!replaceText(composer, text)) showToast(composer, 'Não consegui colocar o texto no campo.');
      placeCaretAtEnd(composer);
      sync();
    };

    function sync() {
      const st = isStale();
      stale.hidden = !st;
      for (const b of body.querySelectorAll('.apply')) b.disabled = st;
    }

    function render() {
      const scroll = body.scrollTop;
      body.textContent = '';
      if (reason) body.append(el('p', { className: 'reason', textContent: reason }));
      const diffEl = el('div', { className: 'diff' });
      for (const seg of segs) {
        if (seg.type === 'eq') { diffEl.append(seg.text); continue; }
        const done = applied.has(seg.id);
        const hunk = el('span', { className: 'hunk' + (done ? ' applied' : '') });
        if (seg.del) hunk.append(el('del', { textContent: seg.del }));
        if (seg.ins) hunk.append(el('ins', { textContent: seg.ins }));
        if (done) {
          hunk.append(el('span', { className: 'done', textContent: '✓ aplicado' }));
        } else {
          const b = el('button', { type: 'button', className: 'apply', textContent: 'Aplicar' });
          b.setAttribute('aria-label', 'Aplicar esta mudança');
          b.addEventListener('click', () => {
            if (isStale() || applied.has(seg.id)) return;
            applied.add(seg.id);
            writeComposer(SlackReviewDiff.applyHunks(segs, applied));
            render();
          });
          hunk.append(b);
        }
        diffEl.append(hunk);
      }
      body.append(diffEl);
      body.scrollTop = scroll;
      sync();
    }

    replaceBtn.addEventListener('click', () => {
      for (const sg of segs) if (sg.type === 'hunk') applied.add(sg.id);
      writeComposer(suggestion);
      render();
    });

    let copiedTimer;
    copyBtn.addEventListener('click', async () => {
      try {
        await copyText(suggestion);
        copyBtn.textContent = 'Copiado';
        live.textContent = 'Copiado';
      } catch {
        copyBtn.textContent = 'Não copiou';
      }
      clearTimeout(copiedTimer);
      copiedTimer = setTimeout(() => { copyBtn.textContent = 'Copiar'; live.textContent = ''; }, 1500);
    });

    closeBtn.addEventListener('click', () => { closePopover(); composer.focus(); });

    keepComposerFocus(pop);
    const stopAnchor = anchor(pop, composer);

    render();
    setTimeout(() => { live.textContent = 'Claude tem uma sugestão'; }, 50);

    s.pop = {
      host, sync,
      cleanup: () => {
        stopAnchor();
        clearTimeout(copiedTimer);
      }
    };
  }

  // ---------- main flow ----------
  async function startReview(composer, original) {
    clearCurrent();
    closeBubble();
    await getOptions();
    const cur = { token: ++tokenSeq, composer, original, timer: null, safety: null, live: null, observer: null, poll: null, failed: false };
    current = cur;
    const hasEntities = !!composer.querySelector(sel('entity'));
    const sendOriginal = () => sendText(composer, original, original);

    startShimmer(cur);
    // Any edit discards the review and ends the shimmer at once
    const changed = () => {
      if (current !== cur) return;
      if (!composer.isConnected || composerText(composer) !== original) clearCurrent();
    };
    cur.observer = new MutationObserver(changed);
    cur.observer.observe(composer, { childList: true, subtree: true, characterData: true });
    // Channel switch can detach the composer without a mutation inside it
    cur.poll = setInterval(changed, 500);

    const fail = (msg) => {
      if (current !== cur) return;
      clearTimeout(cur.timer);
      stopShimmer(cur);
      cur.failed = true;
      showBubble(composer, {
        title: 'Não consegui revisar', message: msg, owner: cur,
        actions: [{ label: 'Enviar original', primary: true, onClick: sendOriginal }],
        onClose: () => clearCurrent()
      });
    };
    cur.timer = setTimeout(() => fail('Tempo esgotado.'), opts.timeoutSec * 1000);

    const context = readContext(composer);
    const [samples, links] = await Promise.all([
      getSamples(context, opts.myName),
      loadLinkInfo(draftLinks(composer, original))
    ]);
    if (current !== cur) return;

    let res;
    try {
      const payload = { model: opts.model, myName: opts.myName, context, samples, draft: original };
      if (links.length) payload.links = links;
      res = await chrome.runtime.sendMessage({ type: 'review', payload });
    } catch (e) {
      return fail('Extensão recarregada. Atualize a página do Slack.');
    }
    if (current !== cur) return;

    if (!res || res.error) return fail((res && res.error) || 'Sem resposta.');
    clearTimeout(cur.timer);

    // Composer changed or disappeared while waiting: discard
    if (!composer.isConnected || composerText(composer) !== original) return clearCurrent();

    if (!res.significant || !res.suggestion || norm(res.suggestion) === norm(original)) {
      return sendText(composer, original, original);
    }

    // Nothing is sent: the user decides what goes into the composer
    clearCurrent();
    openPopover(composer, { original, suggestion: res.suggestion, reason: res.reason || '', hasEntities });
  }

  function handleSendAttempt(e, composer) {
    if (bypass) return;
    if (!composer || !composer.isConnected) return;
    const text = composerText(composer);
    if (!text) return;

    // Option+Enter: send without review
    if (e.type === 'keydown' && e.altKey) {
      e.preventDefault();
      e.stopImmediatePropagation();
      sendText(composer, text, text, { skipPlaceholder: true });
      return;
    }

    // ⟨…⟩ marks info only the author can fill in
    if (PLACEHOLDER.test(text)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      showNotice(composer, 'Preencha ou apague os trechos entre ⟨ ⟩ antes de enviar.');
      return;
    }

    // Same text that just got the suggestion: the user insists, send as is
    if (session && session.composer === composer && session.insisted === norm(text)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      sendText(composer, text, text);
      return;
    }

    // Short or trivial messages pass through untouched
    if (text.length < opts.minChars || onlyEmojiOrLinks(text)) return;
    closePopover(); // any other text gets a fresh review
    e.preventDefault();
    e.stopImmediatePropagation();
    if (current && !current.failed && current.composer === composer && current.original === text) return; // already reviewing
    startReview(composer, text);
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const path = e.composedPath();
      if (session && session.pop && (path.includes(session.pop.host) || path.includes(session.composer))) {
        e.preventDefault();
        e.stopPropagation();
        closePopover();
        session.composer.focus();
        return;
      }
      // Cancel a running review (or dismiss its error); the text stays for editing
      if (current && (path.includes(current.composer) || (bubble && path.includes(bubble.host)))) {
        e.preventDefault();
        e.stopPropagation();
        const c = current.composer;
        clearCurrent();
        c.focus();
        return;
      }
      if (bubble && (path.includes(bubble.host) || (e.target.closest && e.target.closest(sel('composer'))))) closeBubble();
      return;
    }
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing || bypass) return;
    const composer = e.target && e.target.closest && e.target.closest(sel('composer'));
    if (!composer) return;
    const pop = document.querySelector(sel('autocomplete'));
    if (pop && isVisible(pop)) return;
    handleSendAttempt(e, composer);
  }, true);

  window.addEventListener('click', (e) => {
    if (bypass) return;
    const btn = e.target && e.target.closest && e.target.closest(sel('sendButton'));
    if (!btn) return;
    const composer = q(btn.closest('form') || btn.parentElement?.parentElement || document, 'composer') || q(document, 'composer');
    handleSendAttempt(e, composer);
  }, true);
})();
