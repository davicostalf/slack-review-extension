import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

const ctx = {};
ctx.globalThis = ctx;
vm.runInNewContext(fs.readFileSync(new URL('../extension/diff.js', import.meta.url), 'utf8'), ctx);
const { diff, applyHunks } = ctx.SlackReviewDiff;

const hunks = (segs) => segs.filter((s) => s.type === 'hunk');
const all = (segs) => new Set(hunks(segs).map((h) => h.id));
const perms = (a) => a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p]));

test('single word change', () => {
  const segs = diff('oi tudo bem', 'oi tudo certo');
  assert.equal(hunks(segs).length, 1);
  assert.equal(hunks(segs)[0].del, 'bem');
  assert.equal(hunks(segs)[0].ins, 'certo');
  assert.equal(applyHunks(segs, new Set()), 'oi tudo bem');
  assert.equal(applyHunks(segs, all(segs)), 'oi tudo certo');
});

test('insertion', () => {
  const segs = diff('vou ver isso', 'vou ver isso hoje');
  assert.equal(hunks(segs).length, 1);
  assert.equal(hunks(segs)[0].del.trim(), '');
  assert.equal(applyHunks(segs, all(segs)), 'vou ver isso hoje');
});

test('deletion', () => {
  const segs = diff('acho que talvez dê certo', 'acho que dê certo');
  assert.equal(hunks(segs).length, 1);
  assert.equal(hunks(segs)[0].ins, '');
  assert.equal(applyHunks(segs, all(segs)), 'acho que dê certo');
});

test('applying hunks in any order ends at the full suggestion', () => {
  const a = 'Oi pessoal, o deploy falhou ontem e ninguem viu o motivo ainda';
  const b = 'Oi time, o deploy falhou ontem e ainda ninguém identificou o motivo';
  const segs = diff(a, b);
  const ids = hunks(segs).map((h) => h.id);
  assert.ok(ids.length >= 3);
  for (const order of perms(ids.slice(0, 4))) {
    const applied = new Set();
    for (const id of order) applied.add(id);
    const rest = ids.filter((i) => !order.includes(i));
    for (const id of rest) applied.add(id);
    assert.equal(applyHunks(segs, applied), b);
  }
  assert.equal(applyHunks(segs, new Set()), a);
});

test('each hunk alone changes only its own region', () => {
  const segs = diff('um dois tres quatro cinco', 'um 2 tres quatro 5');
  const [h0, h1] = hunks(segs);
  assert.equal(applyHunks(segs, new Set([h0.id])), 'um 2 tres quatro cinco');
  assert.equal(applyHunks(segs, new Set([h1.id])), 'um dois tres quatro 5');
});

test('whitespace and newlines are preserved', () => {
  const a = 'linha um\n\nlinha  dois\ncom   espaços';
  const b = 'linha um\n\nlinha  2\ncom   espaços';
  const segs = diff(a, b);
  assert.equal(applyHunks(segs, new Set()), a);
  assert.equal(applyHunks(segs, all(segs)), b);
  const c = 'a\nb';
  const d = 'a b';
  assert.equal(applyHunks(diff(c, d), all(diff(c, d))), d);
});

test('identical text has no hunks', () => {
  assert.equal(hunks(diff('igual', 'igual')).length, 0);
  assert.equal(hunks(diff('', '')).length, 0);
});
