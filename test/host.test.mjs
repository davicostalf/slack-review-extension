import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const HOST = path.join(dir, '../native-host/host.js');
const FAKE = path.join(dir, 'fake-claude.mjs');

function frame(obj) {
  const body = Buffer.from(JSON.stringify(obj));
  const head = Buffer.alloc(4);
  head.writeUInt32LE(body.length);
  return Buffer.concat([head, body]);
}

function ask(payload, env = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [HOST], { env: { ...process.env, CLAUDE_BIN: FAKE, ...env } });
    const chunks = [];
    p.stdout.on('data', (d) => chunks.push(d));
    p.on('error', reject);
    p.on('close', () => {
      const buf = Buffer.concat(chunks);
      const len = buf.readUInt32LE(0);
      assert.equal(buf.length, 4 + len, 'single framed reply');
      resolve(JSON.parse(buf.subarray(4).toString('utf8')));
    });
    p.stdin.end(frame(payload));
  });
}

const base = { model: 'sonnet', context: [{ author: 'Ana', text: 'oi' }], samples: ['blz'], myName: 'Ana' };

test('significant via structured_output', async () => {
  const r = await ask({ ...base, draft: 'CASE_SIGNIFICANT texto' });
  assert.deepEqual(r, { significant: true, suggestion: 'Versão melhor', reason: 'Faltava contexto.' });
});

test('significant via fenced result', async () => {
  const r = await ask({ ...base, draft: 'CASE_FENCED' });
  assert.equal(r.significant, true);
  assert.equal(r.suggestion, 'Via result');
});

test('not significant', async () => {
  const r = await ask({ ...base, draft: 'tudo certo por aqui' });
  assert.deepEqual(r, { significant: false, suggestion: 'tudo certo por aqui', reason: '' });
});

test('auth error is mapped', async () => {
  const r = await ask({ ...base, draft: 'CASE_AUTH' });
  assert.equal(r.code, 'not_logged_in');
  assert.match(r.error, /não está logado/);
});

test('usage limit', async () => {
  const r = await ask({ ...base, draft: 'CASE_LIMIT' });
  assert.equal(r.code, 'limit');
});

test('generic cli error', async () => {
  const r = await ask({ ...base, draft: 'CASE_OTHER' });
  assert.equal(r.code, 'unknown');
  assert.match(r.error, /exploded/);
});

test('timeout', async () => {
  const r = await ask({ ...base, draft: 'CASE_SLOW' }, { REVIEW_CLI_TIMEOUT_MS: '300' });
  assert.equal(r.code, 'timeout');
});

test('ping ok returns version', async () => {
  const r = await ask({ type: 'ping', model: 'sonnet' });
  assert.deepEqual(r, { ok: true, version: '9.9.9 (Fake Claude Code)' });
});

test('ping not logged in keeps version', async () => {
  const r = await ask({ type: 'ping' }, { FAKE_MODE: 'auth' });
  assert.equal(r.code, 'not_logged_in');
  assert.equal(r.version, '9.9.9 (Fake Claude Code)');
});

test('ping cli missing', async () => {
  const r = await ask({ type: 'ping' }, { CLAUDE_BIN: '/nonexistent/claude' });
  assert.equal(r.code, 'cli_missing');
});

test('garbage output', async () => {
  const r = await ask({ ...base, draft: 'CASE_GARBAGE' });
  assert.equal(r.code, 'unknown');
});

test('bad shape', async () => {
  const r = await ask({ ...base, draft: 'CASE_BADSHAPE' });
  assert.ok(r.error);
});

test('empty draft', async () => {
  const r = await ask({ ...base, draft: '  ' });
  assert.ok(r.error);
});

test('missing binary', async () => {
  const r = await ask({ ...base, draft: 'x' }, { CLAUDE_BIN: '/nonexistent/claude' });
  assert.equal(r.code, 'cli_missing');
  assert.match(r.error, /Claude Code não encontrado/);
});

test('cli flags are passed', async () => {
  const r = await ask({ ...base, model: 'opus', draft: 'CASE_ECHOARGS' });
  assert.match(r.suggestion, /^-p --model opus --safe-mode --system-prompt/);
});

// ---- updates: temporary bare repo + clone ----
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import { createRequire } from 'node:module';

const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd, stdio: 'pipe' }).toString();
const setManifest = (root, version) => {
  fs.mkdirSync(path.join(root, 'extension'), { recursive: true });
  fs.writeFileSync(path.join(root, 'extension/manifest.json'), JSON.stringify({ version }));
};

// Returns { clone, work }: `work` pushes new versions, `clone` is the install
function makeRepos() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'slack-review-'));
  const bare = path.join(tmp, 'origin.git');
  const work = path.join(tmp, 'work');
  git(tmp, 'init', '--bare', '-b', 'main', bare);
  git(tmp, 'clone', bare, work);
  setManifest(work, '0.1.0');
  fs.mkdirSync(path.join(work, 'native-host'));
  fs.copyFileSync(HOST, path.join(work, 'native-host/host.js'));
  git(work, 'add', '-A');
  git(work, 'commit', '-m', 'v1');
  git(work, 'push', '-u', 'origin', 'main');
  git(tmp, 'clone', bare, path.join(tmp, 'clone'));
  const release = (v) => { setManifest(work, v); git(work, 'commit', '-am', 'v' + v); git(work, 'push'); };
  return { tmp, clone: path.join(tmp, 'clone'), release };
}
const hostIn = (root) => path.join(root, 'native-host/host.js');
const askAt = (root, payload) => new Promise((resolve, reject) => {
  const p = spawn(process.execPath, [hostIn(root)], { env: { ...process.env } });
  const chunks = [];
  p.stdout.on('data', (d) => chunks.push(d));
  p.on('error', reject);
  p.on('close', () => { const b = Buffer.concat(chunks); resolve(JSON.parse(b.subarray(4).toString('utf8'))); });
  p.stdin.end(frame(payload));
});

test('check_update: no update', async () => {
  const { tmp, clone } = makeRepos();
  const r = await askAt(clone, { type: 'check_update' });
  assert.deepEqual(r, { current: '0.1.0', latest: '0.1.0', available: false });
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('check_update: update available, apply fast-forwards', async () => {
  const { tmp, clone, release } = makeRepos();
  release('0.10.0');
  const r = await askAt(clone, { type: 'check_update' });
  assert.deepEqual(r, { current: '0.1.0', latest: '0.10.0', available: true });
  const a = await askAt(clone, { type: 'apply_update' });
  assert.equal(a.ok, true);
  assert.equal(a.version, '0.10.0');
  assert.equal(JSON.parse(fs.readFileSync(path.join(clone, 'extension/manifest.json'), 'utf8')).version, '0.10.0');
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('apply_update refuses local changes', async () => {
  const { tmp, clone, release } = makeRepos();
  release('0.2.0');
  fs.appendFileSync(path.join(clone, 'extension/manifest.json'), '\n');
  const a = await askAt(clone, { type: 'apply_update' });
  assert.equal(a.code, 'local_changes');
  assert.match(a.error, /alterações locais/);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('check_update: not a git checkout', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'slack-review-'));
  fs.mkdirSync(path.join(tmp, 'native-host'));
  fs.copyFileSync(HOST, path.join(tmp, 'native-host/host.js'));
  setManifest(tmp, '0.1.0');
  const r = await askAt(tmp, { type: 'check_update' });
  assert.equal(r.code, 'no_repo');
  assert.equal(r.error, 'Esta instalação não veio do git; atualize manualmente.');
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('check_update: unreachable origin is fetch_failed', async () => {
  const { tmp, clone } = makeRepos();
  git(clone, 'remote', 'set-url', 'origin', path.join(tmp, 'missing.git'));
  const r = await askAt(clone, { type: 'check_update' });
  assert.equal(r.code, 'fetch_failed');
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('git access errors are classified as no_access', () => {
  const { gitAccessFailure, semverGt } = createRequire(import.meta.url)(HOST);
  assert.equal(gitAccessFailure('fatal: could not read Username for https://github.com', 'fetch_failed'), 'no_access');
  assert.equal(gitAccessFailure('remote: Repository not found.', 'fetch_failed'), 'no_access');
  assert.equal(gitAccessFailure('Could not resolve host: github.com', 'fetch_failed'), 'fetch_failed');
  assert.ok(semverGt('0.10.0', '0.9.0'));
  assert.ok(!semverGt('0.2.0', '0.2.0'));
});
