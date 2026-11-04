const DEFAULTS = { myName: '', model: 'claude-sonnet-5-5', minChars: 15, timeoutSec: 30 };
const ALL_URLS = { origins: ['<all_urls>'] };
const $ = (id) => document.getElementById(id);

function ensureModelOption(value) {
  const sel = $('model');
  if (![...sel.options].some((o) => o.value === value)) sel.add(new Option(value, value));
  sel.value = value;
}

function syncRequired() {
  const empty = !$('myName').value.trim();
  $('myName-req').hidden = !empty;
  $('myName').setAttribute('aria-invalid', String(empty));
}

function fill(o) {
  $('myName').value = o.myName;
  ensureModelOption(o.model);
  $('minChars').value = o.minChars;
  $('timeoutSec').value = o.timeoutSec;
  syncRequired();
}

// Saved on its own: "Restaurar padrões" covers only the optional settings
async function loadTrigger() {
  const { trigger } = await chrome.storage.sync.get({ trigger: 'shortcut' });
  const r = document.querySelector(`input[name="trigger"][value="${trigger === 'send' ? 'send' : 'shortcut'}"]`);
  r.checked = true;
}

// First run: the mode choice comes right after the header
if (location.hash === '#comecar') {
  const when = document.querySelector('section[aria-labelledby="h-when"]');
  document.querySelector('header').after(when);
  $('when-intro').hidden = false;
}
for (const r of document.querySelectorAll('input[name="trigger"]')) {
  r.addEventListener('change', async () => {
    await chrome.storage.sync.set({ trigger: r.value });
    flashSaved();
  });
}

async function load() {
  const o = await chrome.storage.sync.get(DEFAULTS);
  fill(o);
  await loadTrigger();
  // The browser's permission is the source of truth for the links setting
  const links = await hasLinksPermission();
  $('links').checked = links;
  // Keep optional settings folded unless someone changed them
  $('advanced').open = links || o.model !== DEFAULTS.model || o.minChars !== DEFAULTS.minChars || o.timeoutSec !== DEFAULTS.timeoutSec;
  const { samples = [] } = await chrome.storage.local.get('samples');
  $('count').textContent = String(samples.length);
}

async function hasLinksPermission() {
  try { return await chrome.permissions.contains(ALL_URLS); } catch { return false; }
}

function linksNote(text) {
  $('links-note').textContent = text;
  $('links-note').hidden = !text;
}

// request() needs the user gesture, so it is the first call in the handler
$('links').addEventListener('click', async () => {
  const on = $('links').checked;
  linksNote('');
  try {
    if (on) {
      const ok = await chrome.permissions.request(ALL_URLS);
      if (!ok) {
        $('links').checked = false;
        linksNote('Sem a permissão do navegador, os links não são lidos.');
      }
    } else {
      await chrome.permissions.remove(ALL_URLS);
    }
  } catch {
    $('links').checked = await hasLinksPermission();
    linksNote('Não consegui mudar a permissão.');
  }
});

// Also follows changes made in the browser's own extension settings
const syncLinks = async () => { $('links').checked = await hasLinksPermission(); };
try {
  chrome.permissions.onAdded.addListener(syncLinks);
  chrome.permissions.onRemoved.addListener(syncLinks);
} catch {}

let savedTimer;
function flashSaved() {
  $('saved').classList.add('show');
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => $('saved').classList.remove('show'), 1200);
}

async function save() {
  await chrome.storage.sync.set({
    myName: $('myName').value.trim(),
    model: $('model').value || DEFAULTS.model,
    minChars: Math.max(0, parseInt($('minChars').value, 10) || DEFAULTS.minChars),
    timeoutSec: Math.min(55, Math.max(5, parseInt($('timeoutSec').value, 10) || DEFAULTS.timeoutSec))
  });
  flashSaved();
}

$('myName').addEventListener('input', syncRequired);
for (const id of ['myName', 'model', 'minChars', 'timeoutSec']) $(id).addEventListener('change', save);

$('reset').addEventListener('click', async () => {
  const { myName } = await chrome.storage.sync.get(DEFAULTS);
  fill({ ...DEFAULTS, myName });
  await save();
});

$('clear').addEventListener('click', async () => {
  if (!confirm('Apagar as mensagens guardadas como referência de estilo?')) return;
  await chrome.storage.local.set({ samples: [] });
  $('count').textContent = '0';
});

function setRow(id, state, value) {
  const row = $(id);
  row.dataset.state = state;
  row.querySelector('.value').textContent = value;
}

async function check() {
  for (const id of ['row-host', 'row-cli', 'row-login']) setRow(id, 'pending', 'verificando…');
  $('st-msg').textContent = '';
  $('st-msg').dataset.tone = '';
  $('check').disabled = true;
  const { model } = await chrome.storage.sync.get(DEFAULTS);
  let res;
  try { res = await chrome.runtime.sendMessage({ type: 'ping', model }); } catch (e) { res = { error: String(e), code: 'unknown' }; }
  $('check').disabled = false;
  res = res || { error: 'Sem resposta.', code: 'unknown' };

  if (res.code === 'host_missing') {
    setRow('row-host', 'err', 'não instalado');
    setRow('row-cli', 'pending', '—');
    setRow('row-login', 'pending', '—');
  } else if (res.code === 'cli_missing') {
    setRow('row-host', 'ok', 'instalado');
    setRow('row-cli', 'err', 'não encontrado');
    setRow('row-login', 'pending', '—');
  } else {
    setRow('row-host', 'ok', 'instalado');
    setRow('row-cli', 'ok', res.version ? res.version.replace(/\s*\(Claude Code\)/, '') : 'encontrado');
    if (res.ok) setRow('row-login', 'ok', 'ok');
    else if (res.code === 'not_logged_in') setRow('row-login', 'err', 'não logado');
    else setRow('row-login', 'pending', 'não verificado');
  }
  $('install-cmd').hidden = res.code !== 'host_missing';
  $('st-msg').textContent = res.ok ? 'Tudo certo.' : res.error || '';
  $('st-msg').dataset.tone = res.ok ? '' : 'err';
}
$('check').addEventListener('click', check);

$('copy-cmd').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('install-code').textContent); } catch { return; }
  $('copy-cmd').textContent = 'Copiado';
  setTimeout(() => ($('copy-cmd').textContent = 'Copiar'), 1500);
});

/* rules */
const tag = (name, props = {}, kids = []) => {
  const e = document.createElement(name);
  Object.assign(e, props);
  for (const k of kids) e.append(k);
  return e;
};

async function renderRules() {
  const { rules = [], disabledConversations = {} } = await chrome.storage.local.get(['rules', 'disabledConversations']);
  const box = $('rules-list');
  box.textContent = '';
  const off = Object.entries(disabledConversations);
  $('rules-empty').hidden = rules.length > 0 || off.length > 0;

  // Global rules first, then one group per conversation (named by its newest rule)
  const groups = [{ title: 'Em todas as conversas', items: rules.filter((r) => r.scope === 'all') }];
  const byConv = new Map();
  for (const r of rules.filter((x) => x.scope === 'conversation')) {
    if (!byConv.has(r.conversationId)) byConv.set(r.conversationId, { title: r.conversationName || r.conversationId, items: [] });
    byConv.get(r.conversationId).items.push(r);
  }
  groups.push(...byConv.values());

  for (const g of groups) {
    if (!g.items.length) continue;
    const list = tag('ul', { className: 'rules' });
    for (const r of g.items) {
      const rm = tag('button', { type: 'button', className: 'icon', textContent: '×', title: 'Remover regra' });
      rm.setAttribute('aria-label', 'Remover regra');
      rm.addEventListener('click', async () => {
        const cur = (await chrome.storage.local.get({ rules: [] })).rules;
        await chrome.storage.local.set({ rules: cur.filter((x) => x.id !== r.id) });
      });
      list.append(tag('li', {}, [tag('span', { className: 'text', textContent: r.text }), rm]));
    }
    box.append(tag('h3', { className: 'group-title', textContent: g.title }), list);
  }

  if (off.length) {
    const list = tag('ul', { className: 'rules' });
    for (const [id, name] of off) {
      const on = tag('button', { type: 'button', className: 'link', textContent: 'Ligar de novo' });
      on.setAttribute('aria-label', 'Ligar de novo a revisão em ' + name);
      on.addEventListener('click', async () => {
        const cur = (await chrome.storage.local.get({ disabledConversations: {} })).disabledConversations;
        delete cur[id];
        await chrome.storage.local.set({ disabledConversations: cur });
      });
      list.append(tag('li', {}, [tag('span', { className: 'text', textContent: name }), on]));
    }
    box.append(tag('h3', { className: 'group-title', textContent: 'Conversas sem revisão' }), list);
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.rules || changes.disabledConversations)) renderRules();
});

/* version / updates */
const CURRENT = chrome.runtime.getManifest().version;

function showUpdate(u) {
  const msg = $('up-msg');
  msg.dataset.tone = '';
  msg.textContent = '';
  $('banner').hidden = true;
  $('ver-now').textContent = 'Versão ' + CURRENT;
  if (!u) return;
  if (u.code === 'no_repo') { msg.textContent = u.error; return; }
  // A cached result may predate the last update
  if (u.available && u.latest !== CURRENT) {
    $('banner-title').textContent = 'Nova versão disponível: ' + u.latest;
    $('banner-msg').dataset.tone = '';
    $('banner-msg').textContent = 'Você está na ' + CURRENT + '. A extensão recarrega sozinha depois de atualizar.';
    $('banner').hidden = false;
  } else if (u.error) {
    msg.dataset.tone = 'err';
    msg.textContent = u.error;
  } else if (u.latest) {
    msg.textContent = 'Você está na versão mais recente.';
  }
}

async function checkUpdate() {
  $('check-update').disabled = true;
  $('up-msg').dataset.tone = '';
  $('up-msg').textContent = 'Verificando…';
  let res;
  try { res = await chrome.runtime.sendMessage({ type: 'check_update' }); } catch (e) { res = { error: String(e), code: 'unknown' }; }
  $('check-update').disabled = false;
  showUpdate(res || { error: 'Sem resposta.', code: 'unknown' });
}

$('update').addEventListener('click', async () => {
  $('update').disabled = true;
  $('update').textContent = 'Atualizando…';
  const msg = $('banner-msg');
  msg.dataset.tone = '';
  let res;
  try { res = await chrome.runtime.sendMessage({ type: 'apply_update' }); } catch (e) { res = { error: String(e), code: 'unknown' }; }
  res = res || { error: 'Sem resposta.', code: 'unknown' };
  if (res.ok) {
    // The extension reloads itself right after this reply
    msg.textContent = 'Atualizado para a versão ' + res.version + '. Recarregando…';
    return;
  }
  $('update').disabled = false;
  $('update').textContent = 'Atualizar';
  msg.dataset.tone = 'err';
  msg.textContent = res.error || 'Não consegui atualizar.';
});
$('check-update').addEventListener('click', checkUpdate);

async function loadUpdate() {
  const { update } = await chrome.storage.local.get('update');
  showUpdate(update);
}

load();
renderRules();
check();
// Show the last known result right away, then ask the repo
loadUpdate().then(checkUpdate);
