// Conversation helpers for Slack's URL and tab title. Pure functions, no DOM.
(function (root) {
  const ID_RE = /^[CDG][A-Z0-9]{6,}$/;
  const PREFIX_RE = /^(?:[*!•]\s*|\(\d+\+?\)\s*)+/; // unread markers: "* ", "(3) "
  // "general (Channel) - Workspace - Slack", "Ana (DM)"; name may hold its own parentheses
  const TITLE_RE = /^(.+?)\s+\(([^()]+)\)(?:\s+[-–—]\s|$)/;

  // app.slack.com/client/<TEAM>/<CHANNEL_ID>[/...] -> channel id, or null
  function idFromUrl(href) {
    let u;
    try { u = new URL(href); } catch { return null; }
    if (u.hostname !== 'app.slack.com') return null;
    const m = /^\/client\/[A-Z0-9]+\/([A-Z0-9]+)/.exec(u.pathname);
    return m && ID_RE.test(m[1]) ? m[1] : null;
  }

  // -> { kind: 'channel' | 'dm', name } or null
  function titleInfo(title) {
    const m = TITLE_RE.exec(String(title || '').replace(PREFIX_RE, '').trim());
    if (!m) return null;
    const label = m[2].toLowerCase();
    const kind = /direct|dm|direta/.test(label) ? 'dm' : /channel|canal/.test(label) ? 'channel' : null;
    const name = m[1].replace(/^#\s*/, '').trim();
    return kind && name ? { kind, name } : null;
  }

  function displayName(kind, name) {
    return kind === 'dm' ? 'DM com ' + name : '#' + name;
  }

  function nameFromTitle(title) {
    const i = titleInfo(title);
    return i ? displayName(i.kind, i.name) : null;
  }

  root.SlackReviewConvo = { idFromUrl, titleInfo, displayName, nameFromTitle };
})(globalThis);
