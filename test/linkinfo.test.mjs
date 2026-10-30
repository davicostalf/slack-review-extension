import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

const ctx = { URL }; // URL is a Node global the vm sandbox lacks
ctx.globalThis = ctx;
vm.runInNewContext(fs.readFileSync(new URL('../extension/linkinfo.js', import.meta.url), 'utf8'), ctx);
const { parseLinkInfo, isFetchableUrl } = ctx.SlackReviewLinks;

const U = 'https://docs.example.com/d/123';
const page = (head) => `<html><head>${head}</head><body>x</body></html>`;

test('og:title wins over <title>', () => {
  const r = parseLinkInfo(page('<title>Outro</title><meta property="og:title" content="Proposta de pricing Q3">'), U, U);
  assert.deepEqual({ ...r }, { url: U, title: 'Proposta de pricing Q3', description: '' });
});

test('twitter:title beats <title>, og beats twitter', () => {
  assert.equal(parseLinkInfo(page('<title>T</title><meta name="twitter:title" content="Tw">'), U, U).title, 'Tw');
  assert.equal(parseLinkInfo(page('<meta name="twitter:title" content="Tw"><meta property="og:title" content="Og">'), U, U).title, 'Og');
});

test('falls back to <title>', () => {
  assert.equal(parseLinkInfo(page('<title>\n  Roadmap   2026 </title>'), U, U).title, 'Roadmap 2026');
});

test('attribute order and quote style', () => {
  const r = parseLinkInfo(page(`<meta content='Resumo do plano' property='og:description'><meta content="Plano" name="og:title">`), U, U);
  assert.equal(r.title, 'Plano');
  assert.equal(r.description, 'Resumo do plano');
  const d = parseLinkInfo(page('<title>A</title><meta content="Só descrição" name="description">'), U, U);
  assert.equal(d.description, 'Só descrição');
});

test('og:description beats meta description', () => {
  const r = parseLinkInfo(page('<title>A</title><meta name="description" content="b"><meta property="og:description" content="a">'), U, U);
  assert.equal(r.description, 'a');
});

test('entities are decoded once', () => {
  const r = parseLinkInfo(page('<title>Tom &amp; Jerry &#8211; &#x41;&quot;x&quot; &amp;lt;</title>'), U, U);
  assert.equal(r.title, 'Tom & Jerry – A"x" &lt;');
});

test('site suffixes are stripped, the rest is kept', () => {
  assert.equal(parseLinkInfo(page('<title>Proposta - Google Docs</title>'), U, U).title, 'Proposta');
  assert.equal(parseLinkInfo(page('<title>Orçamento - Google Sheets</title>'), U, U).title, 'Orçamento');
  assert.equal(parseLinkInfo(page('<title>Home – Figma</title>'), U, U).title, 'Home');
  assert.equal(parseLinkInfo(page('<title>Plano | Notion</title>'), U, U).title, 'Plano');
  assert.equal(parseLinkInfo(page('<title>[ABC-1] Bug no checkout - Jira</title>'), U, U).title, '[ABC-1] Bug no checkout');
  assert.equal(parseLinkInfo(page('<title>Figma - o guia</title>'), U, U).title, 'Figma - o guia');
});

test('login wall by final URL', () => {
  const t = page('<title>Algo</title>');
  for (const f of ['https://accounts.google.com/v3/signin', 'https://x.com/login?next=/a', 'https://x.com/users/sign_in', 'https://x.com/auth/start', 'https://sso.x.com/a']) {
    assert.deepEqual({ ...parseLinkInfo(t, f, U) }, { url: U, login: true }, f);
  }
  // not a login: "sso" and "auth" inside other words
  assert.equal(parseLinkInfo(t, 'https://x.com/lesson/1', U).title, 'Algo');
  assert.equal(parseLinkInfo(t, 'https://x.com/author/1', U).title, 'Algo');
});

test('login wall by title', () => {
  for (const t of ['Sign in', 'Log in to Jira', 'Login', 'Entrar na conta', 'Fazer login - X']) {
    assert.equal(parseLinkInfo(page(`<title>${t}</title>`), U, U).login, true, t);
  }
  assert.equal(parseLinkInfo(page('<title>Loginx dashboard</title>'), U, U).login, undefined);
});

test('generic titles give null', () => {
  assert.equal(parseLinkInfo(page('<title></title>'), U, U), null);
  assert.equal(parseLinkInfo('', U, U), null);
  assert.equal(parseLinkInfo(page('<title>example.com</title>'), 'https://www.example.com/x', 'https://www.example.com/x'), null);
  for (const t of ['Google Docs', 'Figma', 'Jira', 'Notion']) assert.equal(parseLinkInfo(page(`<title>${t}</title>`), U, U), null, t);
  assert.equal(parseLinkInfo(page('<title>Untitled - Google Docs</title>'), U, U).title, 'Untitled');
});

test('caps', () => {
  const r = parseLinkInfo(page(`<title>${'t'.repeat(500)}</title><meta name="description" content="${'d'.repeat(900)}">`), U, U);
  assert.equal(r.title.length, 200);
  assert.equal(r.description.length, 300);
});

test('url is the requested one', () => {
  const r = parseLinkInfo(page('<title>A</title>'), 'https://other.com/final', U);
  assert.equal(r.url, U);
});

test('isFetchableUrl', () => {
  assert.equal(isFetchableUrl('https://figma.com/file/abc'), true);
  assert.equal(isFetchableUrl('ftp://x.com/a'), false);
  assert.equal(isFetchableUrl('javascript:alert(1)'), false);
  assert.equal(isFetchableUrl('not a url'), false);
  for (const u of ['https://x.com/logout', 'https://x.com/a?token=1', 'https://x.com/confirm/9', 'https://x.com/unsubscribe', 'https://x.com/x?code=2', 'https://x.com/magic-link', 'https://x.com/delete/1', 'https://x.com/verify', 'https://x.com/reset', 'https://x.com/approve', 'https://x.com/sign-out', 'https://x.com/signout']) {
    assert.equal(isFetchableUrl(u), false, u);
  }
});
