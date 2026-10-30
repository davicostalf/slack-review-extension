importScripts('linkinfo.js');

const HOST = 'com.claude_slack_review.host';
const BLOCK_MS = 5 * 60 * 1000;
const BLOCKING_CODES = ['not_logged_in', 'host_missing'];
// Slightly under the 4s the content script waits, so our answer arrives in time
const LINK_TIMEOUT_MS = 3500;
const LINK_MAX_BYTES = 200 * 1024;
const LINK_MAX_COUNT = 2;
const ALL_URLS = { origins: ['<all_urls>'] };
const UPDATE_ALARM = 'update-check';
const HOST_MISSING_MSG = 'Falta instalar o conector local. Rode o comando de instalação (veja a seção Instalação do README).';

function callHost(payload) {
  return new Promise((resolve) => {
    chrome.runtime.sendNativeMessage(HOST, payload, (res) => {
      const err = chrome.runtime.lastError;
      if (err) {
        const m = err.message || '';
        if (/not found|forbidden/i.test(m)) return resolve({ error: HOST_MISSING_MSG, code: 'host_missing' });
        return resolve({ error: 'Falha ao falar com o conector local: ' + m, code: 'unknown' });
      }
      resolve(res || { error: 'Resposta vazia do conector local.', code: 'unknown' });
    });
  });
}

async function getBlock() {
  const { block } = await chrome.storage.local.get('block');
  return block && block.until > Date.now() ? block : null;
}

async function handleReview(payload) {
  const block = await getBlock();
  if (block) return { error: block.error, code: block.code, cached: true };
  const res = await callHost(payload);
  if (res.error && BLOCKING_CODES.includes(res.code)) {
    await chrome.storage.local.set({ block: { until: Date.now() + BLOCK_MS, error: res.error, code: res.code } });
  }
  return res;
}

// Opens the page with the user's own session and reads only title and description.
// Returns { url, title, description } or null (login wall, non-HTML, error, timeout).
async function fetchLinkInfo(url) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), LINK_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      credentials: 'include', redirect: 'follow', signal: ctl.signal,
      referrerPolicy: 'no-referrer', headers: { Accept: 'text/html' }
    });
    const type = res.headers.get('content-type') || '';
    if (!res.ok || !/text\/html/i.test(type) || !res.body) return null;
    const reader = res.body.getReader();
    const chunks = [];
    let size = 0;
    while (size < LINK_MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.length;
    }
    reader.cancel().catch(() => {});
    const bytes = new Uint8Array(size);
    let off = 0;
    for (const c of chunks) { bytes.set(c, off); off += c.length; }
    let charset = (/charset=([\w-]+)/i.exec(type) || [])[1] || 'utf-8';
    let html;
    try { html = new TextDecoder(charset).decode(bytes); } catch { html = new TextDecoder('utf-8').decode(bytes); }
    const info = SlackReviewLinks.parseLinkInfo(html, res.url || url, url);
    return info && !info.login ? info : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function handleLinkInfo(urls) {
  try {
    if (!(await chrome.permissions.contains(ALL_URLS))) return [];
    const list = (Array.isArray(urls) ? urls : [])
      .filter((u) => typeof u === 'string' && SlackReviewLinks.isFetchableUrl(u))
      .slice(0, LINK_MAX_COUNT);
    const found = await Promise.all(list.map(fetchLinkInfo));
    // Nothing but url, title and description leaves the browser
    return found.filter(Boolean).map((i) => ({ url: i.url, title: i.title, description: i.description }));
  } catch {
    return [];
  }
}

async function handlePing(model) {
  const res = await callHost({ type: 'ping', model });
  // A fresh check resets the cached failure
  if (res.ok || !BLOCKING_CODES.includes(res.code)) await chrome.storage.local.remove('block');
  return res;
}

async function setBadge(available) {
  if (available) {
    await chrome.action.setBadgeText({ text: '1' });
    await chrome.action.setBadgeBackgroundColor({ color: '#616061' });
    await chrome.action.setTitle({ title: 'Nova versão disponível' });
  } else {
    await chrome.action.setBadgeText({ text: '' });
    await chrome.action.setTitle({ title: 'Revisor de mensagens do Slack' });
  }
}

async function handleCheckUpdate() {
  const res = await callHost({ type: 'check_update' });
  const update = { ...res, at: Date.now() };
  // Keep the last known good result when the check itself failed
  if (res.error) {
    const { update: prev } = await chrome.storage.local.get('update');
    await chrome.storage.local.set({ update: { ...(prev || {}), error: res.error, code: res.code, at: update.at } });
  } else {
    await chrome.storage.local.set({ update });
    await setBadge(res.available);
  }
  return res;
}

async function handleApplyUpdate() {
  const res = await callHost({ type: 'apply_update' });
  if (res.ok) {
    await chrome.storage.local.remove('update');
    await setBadge(false);
  }
  return res;
}

function scheduleChecks() {
  chrome.alarms.get(UPDATE_ALARM, (a) => {
    if (!a) chrome.alarms.create(UPDATE_ALARM, { periodInMinutes: 24 * 60 });
  });
}

chrome.alarms.onAlarm.addListener((a) => { if (a.name === UPDATE_ALARM) handleCheckUpdate(); });
chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());
chrome.runtime.onStartup.addListener(() => { scheduleChecks(); handleCheckUpdate(); });

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg) return false;
  if (msg.type === 'review') handleReview(msg.payload).then(sendResponse);
  else if (msg.type === 'link_info') handleLinkInfo(msg.urls).then(sendResponse);
  else if (msg.type === 'ping') handlePing(msg.model).then(sendResponse);
  else if (msg.type === 'check_update') handleCheckUpdate().then(sendResponse);
  else if (msg.type === 'apply_update') {
    handleApplyUpdate().then((res) => {
      sendResponse(res);
      // Reload after replying so the options page gets the answer first
      if (res.ok) setTimeout(() => chrome.runtime.reload(), 300);
    });
  } else return false;
  return true;
});

chrome.runtime.onInstalled.addListener((d) => {
  if (d.reason === 'install') chrome.runtime.openOptionsPage();
  scheduleChecks();
  handleCheckUpdate();
});
