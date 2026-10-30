const $ = (id) => document.getElementById(id);
const MAX_RULES = 50;
const MODEL_DEFAULT = 'claude-sonnet-5-5';

let conv = null;       // { id, name } or null when the tab isn't a Slack conversation
let pending = null;    // the interpretation waiting for Salvar

function status(text, tone = '') {
  $('status').textContent = text;
  $('status').dataset.tone = tone;
}

let stale = false;     // Slack tab whose content script is gone (opened before an update)

// The tab's URL and title identify the conversation on their own; the content
// script only refines the name. No answer from it means the tab needs a reload.
async function getConversation() {
  let tab;
  try { [tab] = await chrome.tabs.query({ active: true, currentWindow: true }); } catch { return null; }
  if (!tab || tab.id == null) return null;
  const id = SlackReviewConvo.idFromUrl(tab.url || '');
  if (!id) return null;
  let live = null;
  try { live = await chrome.tabs.sendMessage(tab.id, { type: 'get_conversation' }); } catch { stale = true; }
  const name = (live && live.id === id && live.name) || SlackReviewConvo.nameFromTitle(tab.title) || 'Conversa atual';
  return { id, name };
}

function scope() {
  return conv ? document.querySelector('input[name="scope"]:checked').value : 'all';
}

async function readDisabled() {
  const { disabledConversations } = await chrome.storage.local.get({ disabledConversations: {} });
  return disabledConversations || {};
}

async function showToggle() {
  const off = conv ? !!(await readDisabled())[conv.id] : false;
  $('toggle').checked = !off;
}

$('toggle').addEventListener('change', async () => {
  if (!conv) return;
  // Read fresh: the options page may have changed the list meanwhile
  const disabled = await readDisabled();
  if ($('toggle').checked) delete disabled[conv.id];
  else disabled[conv.id] = conv.name;
  await chrome.storage.local.set({ disabledConversations: disabled });
});

function clearResult() {
  pending = null;
  $('result').hidden = true;
}

// The scope selector decides where a rule applies, not Claude
function showResult(res) {
  pending = res;
  const all = scope() === 'all';
  let text = res.message;
  let canSave = res.kind !== 'not_about_review';
  if (res.kind === 'rule') text = (all ? 'Em todas as conversas: ' : 'Nesta conversa: ') + res.text;
  else if (res.kind === 'off_here' && all) {
    text = 'Para parar de revisar em todas as conversas, desative a extensão em chrome://extensions.';
    canSave = false;
  } else if (res.kind === 'off_here') text = 'Desligar a revisão nesta conversa.';
  $('result-text').textContent = text;
  $('result-actions').hidden = !canSave;
  $('result').hidden = false;
}

for (const r of document.querySelectorAll('input[name="scope"]')) {
  r.addEventListener('change', () => { if (pending) showResult(pending); });
}

async function ask() {
  const request = $('request').value.trim();
  if (!request) return $('request').focus();
  clearResult();
  status('');
  $('ask').disabled = true;
  $('ask').textContent = 'Entendendo…';
  let res;
  try {
    const { model } = await chrome.storage.sync.get({ model: MODEL_DEFAULT });
    res = await chrome.runtime.sendMessage({ type: 'interpret_rule', request, conversation: conv, model });
  } catch (e) {
    res = { error: 'Não consegui falar com a extensão. Tente de novo.' };
  }
  $('ask').disabled = false;
  $('ask').textContent = 'Pedir';
  if (!res || res.error) return status((res && res.error) || 'Sem resposta.', 'err');
  showResult(res);
}

async function save() {
  const res = pending;
  if (!res || res.kind === 'not_about_review') return;
  if (res.kind === 'off_here' && scope() === 'all') return;
  if (res.kind === 'off_here') {
    if (!conv) return;
    const disabled = await readDisabled();
    disabled[conv.id] = conv.name;
    await chrome.storage.local.set({ disabledConversations: disabled });
    $('toggle').checked = false;
    status('Revisão desligada nesta conversa.', 'ok');
  } else {
    const { rules } = await chrome.storage.local.get({ rules: [] });
    if (rules.length >= MAX_RULES) {
      return status('Limite de ' + MAX_RULES + ' regras. Remova alguma em "Regras e configurações".', 'err');
    }
    const local = scope() === 'conversation' && conv;
    rules.push({
      id: crypto.randomUUID(),
      scope: local ? 'conversation' : 'all',
      ...(local ? { conversationId: conv.id, conversationName: conv.name } : {}),
      text: res.text,
      createdAt: Date.now()
    });
    await chrome.storage.local.set({ rules });
    status('Regra salva', 'ok');
  }
  clearResult();
  $('request').value = '';
}

$('ask').addEventListener('click', ask);
$('save').addEventListener('click', save);
$('adjust').addEventListener('click', () => {
  clearResult();
  status('');
  $('request').focus();
});
$('request').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); if (!$('ask').disabled) ask(); }
});
$('options').addEventListener('click', () => { chrome.runtime.openOptionsPage(); window.close(); });

// The options page can turn a conversation back on while the popup is open
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.disabledConversations) showToggle();
});

(async function init() {
  conv = await getConversation();
  $('not-slack').hidden = !!conv;
  $('conv-name').hidden = !conv;
  $('switch-row').hidden = !conv;
  $('scope').hidden = !conv;
  $('reload-note').hidden = !(conv && stale);
  if (conv) {
    $('conv-name').textContent = conv.name;
    await showToggle();
  }
})();
