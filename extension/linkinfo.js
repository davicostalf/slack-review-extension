// Link helpers and page-metadata parsing. Pure functions, no DOM, no network.
(function (root) {
  const TITLE_MAX = 200;
  const DESC_MAX = 300;

  const ACTION_RE = /logout|signout|sign-out|unsubscribe|confirm|approve|verify|reset|delete|token=|code=|magic/i;
  // Matched against host + path of the final URL (after redirects)
  const LOGIN_URL_RE = /accounts\.google\.com|\/login|\/signin|\/sign_in|\/auth(?![a-z])|(^|[./-])sso([./-]|$)/i;
  const LOGIN_TITLE_RE = /^(sign in|log in|login|entrar|fazer login)\b/i;
  const GENERIC_TITLES = new Set(['google docs', 'google sheets', 'google slides', 'google drive', 'figma', 'jira', 'notion']);
  const SUFFIX_RE = /\s+[-–—|]\s+(Google Docs|Google Sheets|Google Slides|Google Drive|Figma|Notion|Jira)\s*$/i;

  const ENTITIES = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
    ndash: '–', mdash: '—', hellip: '…', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', copy: '©'
  };

  // http(s) only, and nothing that looks like an action (logout, confirm, tokens...)
  function isFetchableUrl(url) {
    let u;
    try { u = new URL(url); } catch { return false; }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    return !ACTION_RE.test(url);
  }

  function decodeEntities(s) {
    return s.replace(/&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|([a-zA-Z]+));/g, (m, dec, hex, name) => {
      if (name) return Object.prototype.hasOwnProperty.call(ENTITIES, name) ? ENTITIES[name] : m;
      const cp = dec ? parseInt(dec, 10) : parseInt(hex, 16);
      if (!(cp > 0 && cp <= 0x10ffff)) return m;
      try { return String.fromCodePoint(cp); } catch { return m; }
    });
  }

  const squash = (s, max) => s.replace(/\s+/g, ' ').trim().slice(0, max);
  const clean = (s, max) => squash(decodeEntities(s || ''), max);

  // First value found for each meta property/name, attribute order and quotes agnostic
  function readMetas(html) {
    const metas = {};
    const tagRe = /<meta\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi;
    const attrRe = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
    let t;
    while ((t = tagRe.exec(html))) {
      const attrs = {};
      let a;
      attrRe.lastIndex = 0;
      while ((a = attrRe.exec(t[0]))) {
        attrs[a[1].toLowerCase()] = a[2] !== undefined ? a[2] : a[3] !== undefined ? a[3] : a[4];
      }
      const key = (attrs.property || attrs.name || '').toLowerCase();
      if (key && attrs.content !== undefined && !(key in metas)) metas[key] = attrs.content;
    }
    return metas;
  }

  function hostAndPath(url) {
    try { const u = new URL(url); return u.hostname + u.pathname; } catch { return String(url || ''); }
  }

  // -> { url, title, description } | { url, login: true } | null
  function parseLinkInfo(html, finalUrl, requestedUrl) {
    const url = requestedUrl || finalUrl;
    if (LOGIN_URL_RE.test(hostAndPath(finalUrl))) return { url, login: true };

    const text = String(html || '');
    const metas = readMetas(text);
    const tm = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(text);
    const pageTitle = clean(tm && tm[1], 1000);
    const rawTitle = clean(metas['og:title'] || metas['twitter:title'], 1000) || pageTitle;

    if (LOGIN_TITLE_RE.test(rawTitle) || LOGIN_TITLE_RE.test(pageTitle)) return { url, login: true };

    const title = squash(rawTitle.replace(SUFFIX_RE, ''), TITLE_MAX); // already decoded
    let host = '';
    try { host = new URL(finalUrl).hostname.replace(/^www\./, '').toLowerCase(); } catch {}
    const low = title.toLowerCase();
    if (!title || low === host || GENERIC_TITLES.has(low)) return null;

    const description = clean(metas['og:description'] || metas['description'], DESC_MAX);
    return { url, title, description };
  }

  root.SlackReviewLinks = { isFetchableUrl, parseLinkInfo, TITLE_MAX, DESC_MAX };
})(globalThis);
