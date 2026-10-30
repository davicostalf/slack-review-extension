// Word-level diff and hunk application. Pure functions, no DOM.
(function (root) {
  const tokenize = (s) => (s || '').match(/\s+|\S+/g) || [];
  const isSpace = (s) => /^\s*$/.test(s);

  // Segments: { type: 'eq', text } | { type: 'hunk', id, del, ins }
  function diff(a, b) {
    const x = tokenize(a);
    const y = tokenize(b);
    const n = x.length;
    const m = y.length;
    const ops = []; // { t: 'eq'|'del'|'ins', s }

    if (n * m > 4e6) {
      // Too big for the table: treat as one replacement
      for (const s of x) ops.push({ t: 'del', s });
      for (const s of y) ops.push({ t: 'ins', s });
    } else {
      const w = m + 1;
      const L = new Uint16Array((n + 1) * w);
      for (let i = n - 1; i >= 0; i--) {
        for (let j = m - 1; j >= 0; j--) {
          L[i * w + j] = x[i] === y[j]
            ? L[(i + 1) * w + j + 1] + 1
            : Math.max(L[(i + 1) * w + j], L[i * w + j + 1]);
        }
      }
      let i = 0;
      let j = 0;
      while (i < n && j < m) {
        if (x[i] === y[j]) { ops.push({ t: 'eq', s: x[i] }); i++; j++; }
        else if (L[(i + 1) * w + j] >= L[i * w + j + 1]) { ops.push({ t: 'del', s: x[i++] }); }
        else { ops.push({ t: 'ins', s: y[j++] }); }
      }
      while (i < n) ops.push({ t: 'del', s: x[i++] });
      while (j < m) ops.push({ t: 'ins', s: y[j++] });
    }

    const segs = [];
    for (const op of ops) {
      const last = segs[segs.length - 1];
      if (op.t === 'eq') {
        if (last && last.type === 'eq') last.text += op.s;
        else segs.push({ type: 'eq', text: op.s });
      } else {
        let h = last;
        if (!h || h.type !== 'hunk') { h = { type: 'hunk', del: '', ins: '' }; segs.push(h); }
        if (op.t === 'del') h.del += op.s; else h.ins += op.s;
      }
    }

    // Merge hunks separated only by whitespace so a changed phrase stays one hunk
    const merged = [];
    for (let k = 0; k < segs.length; k++) {
      const s = segs[k];
      const prev = merged[merged.length - 1];
      const next = segs[k + 1];
      if (s.type === 'eq' && isSpace(s.text) && prev && prev.type === 'hunk' && next && next.type === 'hunk') {
        prev.del += s.text + next.del;
        prev.ins += s.text + next.ins;
        k++;
      } else {
        merged.push({ ...s });
      }
    }
    let id = 0;
    for (const s of merged) if (s.type === 'hunk') s.id = id++;
    return merged;
  }

  // Text with the hunks in `applied` (Set of ids) taking their inserted side.
  function applyHunks(segs, applied) {
    let out = '';
    for (const s of segs) {
      if (s.type === 'eq') out += s.text;
      else out += applied.has(s.id) ? s.ins : s.del;
    }
    return out;
  }

  root.SlackReviewDiff = { tokenize, diff, applyHunks };
})(globalThis);
