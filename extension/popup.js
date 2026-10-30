const $ = (id) => document.getElementById(id);
const MAX_RULES = 50;
const MODEL_DEFAULT = 'claude-sonnet-5-5';

let conv = null;       // { id, name } or null when the tab isn't a Slack conversation
let pending = null;    // the interpretation waiting for Salvar

function status(text, tone = '') {
  $('status').textContent = text;
  $('status').dataset.tone = tone;
}

// No receiver (not Slack, or a tab opened before install) counts as "not Slack"
async function getConversation() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || tab.id == null) return null;
    const res = await chrome.tabs.sendMessage(tab.id, { type: 'get_conversation' });
    return res && res.id && res.name ? res : null;
  } catch {
    return null;
  }
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

function showResult(res) {
  pending = res;
  const scope = res.scope === 'conversation' ? 'Nesta conversa: ' : 'Em todas as conversas: ';
  if (res.kind === 'rule') $('result-text').textContent = scope + res.text;
  else if (res.kind === 'off_here') $('result-text').textContent = 'Desligar a revisão nesta conversa.';
  else $('result-text').textContent = res.message;
  $('result-actions').hidden = res.kind === 'not_about_review';
  $('result').hidden = false;
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
    const local = res.scope === 'conversation' && conv;
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
  if (conv) {
    $('conv-name').textContent = conv.name;
    await showToggle();
  }
})();
