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

  // interpret_rule: cases picked from a marker in the request
  const request = (input.match(/<pedido>\n([\s\S]*?)\n<\/pedido>/) || [])[1];
  if (request !== undefined) {
    const o = (s) => out({ structured_output: { kind: 'rule', scope: 'all', text: '', message: '', ...s } });
    if (request.includes('CASE_OFF')) return o({ kind: 'off_here', scope: 'all' });
    if (request.includes('CASE_RULE_CONV')) return o({ scope: 'conversation', text: 'Tom informal;\nnão corrigir gírias.' });
    if (request.includes('CASE_RULE_ALL')) return o({ text: 'Não revisar mensagens em inglês.' });
    if (request.includes('CASE_NOTREVIEW')) return o({ kind: 'not_about_review', message: 'Só ajusto a revisão.' });
    if (request.includes('CASE_LONG')) return o({ text: 'x'.repeat(300) });
    if (request.includes('CASE_BADRULE')) return o({ text: '  ' });
    if (request.includes('CASE_ECHOPROMPT')) return o({ kind: 'not_about_review', message: request.length + '|' + input.slice(input.indexOf('</pedido>') + 9).trim() });
    if (request.includes('CASE_ECHOARGS')) return o({ kind: 'not_about_review', message: args.join(' ').slice(0, 400) });
    if (request.includes('CASE_AUTH')) return authErr();
    return o({ kind: 'bogus' });
  }

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
  } else if (draft.includes('CASE_ECHOLINKS')) {
    const links = (input.match(/<links>\n([\s\S]*?)\n<\/links>/) || [])[1] || 'NO_LINKS';
    out({ structured_output: { significant: false, suggestion: links, reason: '' } });
  } else if (draft.includes('CASE_ECHORULES')) {
    const rules = (input.match(/<regras_do_autor>\n([\s\S]*?)\n<\/regras_do_autor>/) || [])[1] || 'NO_RULES';
    out({ structured_output: { significant: false, suggestion: rules, reason: '' } });
  } else if (draft.includes('CASE_ECHOARGS')) {
    out({ structured_output: { significant: false, suggestion: args.join(' ').slice(0, 80), reason: '' } });
  } else {
    out({ structured_output: { significant: false, suggestion: draft, reason: '' } });
  }
});
