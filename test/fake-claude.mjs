#!/usr/bin/env node
// Mimics the `claude` CLI. Review cases are picked from a marker in the
// draft (stdin); ping behavior from env FAKE_MODE.
const args = process.argv.slice(2);
if (args.includes('--version')) {
  console.log('9.9.9 (Fake Claude Code)');
  process.exit(0);
}
let input = '';
process.stdin.on('data', (d) => (input += d));
process.stdin.on('end', () => {
  const draft = (input.match(/<rascunho>\n([\s\S]*?)\n<\/rascunho>/) || [])[1] || '';
  const mode = process.env.FAKE_MODE || '';
  const base = { type: 'result', subtype: 'success', is_error: false, session_id: 'x' };
  const out = (o) => process.stdout.write(JSON.stringify({ ...base, ...o }));
  const authErr = () => out({ is_error: true, subtype: 'error', result: 'Invalid API key · Please run /login (OAuth token expired)' });

  if (!draft) { // ping
    if (mode === 'auth') return authErr();
    return out({ result: 'ok' });
  }
  if (draft.includes('CASE_SIGNIFICANT')) {
    out({ result: '', structured_output: { significant: true, suggestion: 'Versão melhor', reason: 'Faltava contexto.' } });
  } else if (draft.includes('CASE_FENCED')) {
    out({ result: '```json\n{"significant":true,"suggestion":"Via result","reason":"ok"}\n```' });
  } else if (draft.includes('CASE_AUTH')) {
    authErr();
  } else if (draft.includes('CASE_LIMIT')) {
    out({ is_error: true, subtype: 'error', result: 'Claude usage limit reached. Resets at 5pm.' });
  } else if (draft.includes('CASE_OTHER')) {
    out({ is_error: true, subtype: 'error', result: 'Something exploded' });
  } else if (draft.includes('CASE_SLOW')) {
    setTimeout(() => out({ structured_output: { significant: false, suggestion: draft, reason: '' } }), 5000);
  } else if (draft.includes('CASE_GARBAGE')) {
    process.stdout.write('this is not json at all');
  } else if (draft.includes('CASE_BADSHAPE')) {
    out({ structured_output: { significant: 'yes' } });
  } else if (draft.includes('CASE_ECHOARGS')) {
    out({ structured_output: { significant: false, suggestion: args.join(' ').slice(0, 80), reason: '' } });
  } else {
    out({ structured_output: { significant: false, suggestion: draft, reason: '' } });
  }
});
