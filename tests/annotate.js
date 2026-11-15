// Prints live-check output as GitHub annotations, grouped by engine, so it can be read without logging in.
const fs = require('fs');
for (const f of ['branch', 'live']) {
  if (!fs.existsSync(f + '.txt')) continue;
  const g = {};
  for (const l of fs.readFileSync(f + '.txt', 'utf8').split('\n')) {
    const m = l.match(/\[(\w+)\]/); const k = m ? m[1] : 'summary';
    (g[k] = g[k] || []).push(l.replace(/\r/g, ''));
  }
  for (const k in g) console.log('::notice title=' + f + '-' + k + '::' + g[k].join('\n').replace(/%/g, '%25').replace(/\n/g, '%0A'));
}
