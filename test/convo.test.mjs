import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

const ctx = { URL }; // URL is a Node global the vm sandbox lacks
ctx.globalThis = ctx;
vm.runInNewContext(fs.readFileSync(new URL('../extension/convo.js', import.meta.url), 'utf8'), ctx);
const { idFromUrl, titleInfo, nameFromTitle } = ctx.SlackReviewConvo;

test('title: channel, private channel and DM', () => {
  assert.equal(nameFromTitle('general (Channel) - Acme - Slack'), '#general');
  assert.equal(nameFromTitle('time-produto (Private channel) - Acme - Slack'), '#time-produto');
  assert.equal(nameFromTitle('Ana (DM) - Acme - Slack'), 'DM com Ana');
  assert.equal(nameFromTitle('Ana, Bruno (DM) - Acme - Slack'), 'DM com Ana, Bruno');
  assert.equal(nameFromTitle('Ana Souza (Direct message) - Acme - Slack'), 'DM com Ana Souza');
});

test('title: pt-BR labels', () => {
  assert.equal(nameFromTitle('geral (Canal) - Acme - Slack'), '#geral');
  assert.equal(nameFromTitle('Ana (Mensagem direta) - Acme - Slack'), 'DM com Ana');
});

test('title: unread markers and parentheses in the name', () => {
  assert.equal(nameFromTitle('* general (Channel) - Acme - Slack'), '#general');
  assert.equal(nameFromTitle('(3) Ana (DM) - Acme - Slack'), 'DM com Ana');
  assert.equal(nameFromTitle('Ana (ela/dela) (DM) - Acme - Slack'), 'DM com Ana (ela/dela)');
  assert.equal(nameFromTitle('general (Channel)'), '#general');
});

test('title: not a conversation', () => {
  assert.equal(nameFromTitle('Threads - Acme - Slack'), null);
  assert.equal(nameFromTitle('Slack'), null);
  assert.equal(nameFromTitle('Ana (away) - Acme - Slack'), null);
  assert.equal(nameFromTitle(''), null);
  assert.equal(nameFromTitle(undefined), null);
  const i = titleInfo('Ana (DM) - Acme - Slack'); // vm objects are cross-realm
  assert.equal(i.kind, 'dm');
  assert.equal(i.name, 'Ana');
});

test('url: conversation id, threads stay in their channel', () => {
  assert.equal(idFromUrl('https://app.slack.com/client/T012ABC/C0123ABCD'), 'C0123ABCD');
  assert.equal(idFromUrl('https://app.slack.com/client/T012ABC/D0123ABCD/thread/D0123ABCD-1700000000.1'), 'D0123ABCD');
  assert.equal(idFromUrl('https://app.slack.com/client/E012ABC/G0123ABCD?x=1'), 'G0123ABCD');
});

test('url: other pages and hosts', () => {
  assert.equal(idFromUrl('https://app.slack.com/client/T012ABC/threads'), null);
  assert.equal(idFromUrl('https://app.slack.com/client/T012ABC'), null);
  assert.equal(idFromUrl('https://example.com/client/T012ABC/C0123ABCD'), null);
  assert.equal(idFromUrl('nope'), null);
});
