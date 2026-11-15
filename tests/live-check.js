// Live check for the Exhibition & Edition Kit.
// Usage: node tests/live-check.js --url https://matteocamata-cloud.github.io/enteleora-kit/ --engines chromium,webkit,firefox
//        node tests/live-check.js --serve . --engines chromium   (serves this folder on a local port)
const pw = require('playwright');
const fs = require('fs');
const path = require('path');
const http = require('http');
const os = require('os');

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const ENGINES = arg('engines', 'chromium,webkit,firefox').split(',');
const OUT = arg('out', path.join(os.tmpdir(), 'kit-live-check'));
fs.mkdirSync(OUT, { recursive: true });

// Letter page minus the page's @page margin of 10mm on each side, in CSS px (96 per inch)
const MM = 96 / 25.4;
const LETTER_W = Math.floor((215.9 - 20) * MM), LETTER_H = Math.floor((279.4 - 20) * MM);

const SHOPIFY_CSV = [
  'Handle,Title,Body (HTML),Vendor,Type,Tags,Published,Option1 Name,Option1 Value,Variant SKU,Variant Price,Image Src',
  'harbor-print,Harbor Print,<p>Giclee</p>,Alex,Giclee print,,TRUE,Size,16x20,HP1,320.00,',
  'harbor-print,,,,,,,Size,24x30,HP2,480.00,',
  'red-chair,Red Chair,"<p>Oil, on canvas</p>",Alex,Painting,,TRUE,Title,Default Title,RC1,"2,400.00",',
].join('\r\n');

function serve(dir) {
  const types = { '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.pdf': 'application/pdf', '.ico': 'image/x-icon' };
  return new Promise(res => {
    const s = http.createServer((q, r) => {
      let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
      const f = path.join(dir, p);
      if (!f.startsWith(path.resolve(dir)) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); }
      r.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
    }).listen(0, '127.0.0.1', () => res({ s, url: `http://127.0.0.1:${s.address().port}/` }));
  });
}

// text nodes that are fully inside the viewport (no scrolling needed)
const viewportText = () => {
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); const out = []; let n;
  while ((n = w.nextNode())) {
    if (!n.textContent.trim()) continue;
    const st = getComputedStyle(n.parentElement); if (st.visibility === 'hidden' || st.display === 'none') continue;
    const r = document.createRange(); r.selectNodeContents(n); const rs = [...r.getClientRects()];
    if (rs.length && rs.every(x => x.top >= 0 && x.bottom <= innerHeight + 1 && x.left >= -1 && x.right <= innerWidth + 1)) out.push(n.textContent);
  }
  return out.join(' ');
};
const FIRST_SCREEN = [
  ['what: tool name', /Exhibition & Edition Kit/],
  ['what: certificates', /certificates/i],
  ['who: for artists', /\bfor (\w+ )?artists\b/i],
  ['promise: no account', /no account/i],
  ['promise: data stays on your computer', /your data stays on (this|your) computer/i],
];
const TABS = ['Works', 'Wall labels', 'Price list', 'Certificates', 'Edition register', 'Condition report', 'Consignment', 'Import & backup'];

async function runEngine(name, URL) {
  let pass = 0, fail = 0;
  const ok = (c, m) => { if (c) pass++; else fail++; console.log(`${c ? 'PASS' : 'FAIL'} [${name}] ${m}`); };
  const type = pw[name];
  let browser;
  try { browser = await type.launch(); } catch (e) { ok(false, 'launch: ' + e.message.split('\n')[0]); return { pass, fail }; }
  console.log(`--- ${name} ${browser.version()} ---`);
  const errors = [];
  const watch = p => { p.on('pageerror', e => errors.push('pageerror: ' + e.message)); p.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); }); };

  // 1. first visit, fresh browser, desktop and phone
  for (const vp of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    const ctx = await browser.newContext({ viewport: vp, locale: 'en-US', acceptDownloads: true });
    const p = await ctx.newPage(); watch(p);
    const resp = await p.goto(URL);
    const tag = `${vp.width}x${vp.height}`;
    if (vp.width === 1280) ok(resp && resp.status() === 200 && (await p.locator('h1').innerText()) === 'Exhibition & Edition Kit', `page loads (HTTP ${resp && resp.status()})`);
    const txt = await p.evaluate(viewportText);
    for (const [label, re] of FIRST_SCREEN) ok(re.test(txt), `first screen ${tag} shows ${label}`);
    const sampleBtn = p.getByRole('button', { name: 'Load sample data' }).first();
    const bb = await sampleBtn.boundingBox();
    ok(bb && bb.y + bb.height <= vp.height, `first screen ${tag}: "Load sample data" visible without scrolling`);
    await p.screenshot({ path: path.join(OUT, `${name}-first-${tag}.png`) });
    // clicks to a printable certificate
    let clicks = 0;
    await sampleBtn.click(); clicks++;
    await p.getByRole('button', { name: 'Certificates' }).click(); clicks++;
    const certs = await p.locator('.cert').count();
    const printBtn = await p.getByRole('button', { name: 'Print this page' }).isVisible();
    ok(certs >= 1 && printBtn && clicks <= 3, `${tag}: printable certificate reached in ${clicks} clicks (certs=${certs})`);
    await ctx.close();
  }

  // 2. main flow (desktop, US)
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'en-US', acceptDownloads: true });
  const p = await ctx.newPage(); watch(p);
  await p.goto(URL);
  await p.getByRole('button', { name: 'Load sample data' }).first().click();
  ok(await p.locator('.work').count() === 3, 'Load sample data adds 3 works');
  const st = await p.evaluate(() => JSON.parse(localStorage.getItem('aek_exhibition_kit_v1')));
  ok(st && st.currency === 'USD', 'US browser defaults to USD (' + (st && st.currency) + ')');
  await p.reload();
  ok(await p.locator('.work').count() === 3, 'data survives a reload');

  // Shopify CSV import
  const csvPath = path.join(OUT, 'shopify.csv'); fs.writeFileSync(csvPath, SHOPIFY_CSV);
  await p.getByRole('button', { name: 'Import & backup' }).click();
  await p.locator('input[type=file][accept*="csv"]').setInputFiles(csvPath);
  await p.getByRole('button', { name: /^Add 2 works$/ }).click();
  const titles = await p.evaluate(() => JSON.parse(localStorage.getItem('aek_exhibition_kit_v1')).works.map(w => w.title + '|' + w.price));
  ok(await p.locator('.work').count() === 5 && titles.includes('Harbor Print|320') && titles.includes('Red Chair|2400'), 'Shopify CSV import adds 2 works (' + titles.slice(3).join(', ') + ')');

  // CSV export starts with a BOM
  await p.getByRole('button', { name: 'Import & backup' }).click();
  const [dl] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Export register (CSV)' }).click()]);
  const cpath = path.join(OUT, name + '-register.csv'); await dl.saveAs(cpath);
  const csv = fs.readFileSync(cpath);
  ok(csv[0] === 0xEF && csv[1] === 0xBB && csv[2] === 0xBF, 'CSV export starts with UTF-8 BOM');

  // no em dashes in visible text on any tab
  const dashTabs = [];
  for (const tn of TABS) {
    await p.getByRole('button', { name: tn, exact: true }).click();
    if ((await p.evaluate(() => document.body.innerText)).includes('—')) dashTabs.push(tn);
  }
  ok(dashTabs.length === 0, 'no em dash in visible text' + (dashTabs.length ? ' (found on: ' + dashTabs.join(', ') + ')' : ''));
  const metaDash = await p.evaluate(() => [...document.querySelectorAll('meta,title')].some(m => /—/.test((m.content || '') + m.textContent)));
  ok(!metaDash, 'no em dash in title/meta tags');

  // phone width: no horizontal page scroll on any tab
  await p.setViewportSize({ width: 390, height: 844 });
  const over = [];
  for (const tn of TABS) {
    await p.getByRole('button', { name: tn, exact: true }).click();
    const o = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (o > 1) over.push(tn + ':' + o);
  }
  ok(over.length === 0, 'phone 390px: no horizontal scroll on 8 tabs' + (over.length ? ' (' + over.join(', ') + ')' : ''));
  await ctx.close();

  // 3. certificates on US Letter: all copies of the sample (19 certificates)
  const pc = await browser.newContext({ viewport: { width: LETTER_W, height: LETTER_H }, locale: 'en-US' });
  const pp = await pc.newPage(); watch(pp);
  await pp.goto(URL);
  await pp.getByRole('button', { name: 'Load sample data' }).first().click();
  await pp.getByRole('button', { name: 'Certificates' }).click();
  await pp.locator('select').first().selectOption('all');
  await pp.emulateMedia({ media: 'print' });
  const certInfo = await pp.evaluate(() => [...document.querySelectorAll('.cert')].map((c, i, a) => {
    const r = c.getBoundingClientRect(); const cs = getComputedStyle(c);
    return { h: r.height, clipped: c.scrollHeight > c.clientHeight + 1, brk: i === a.length - 1 || /page|always/.test(cs.breakAfter + cs.pageBreakAfter) };
  }));
  const n = certInfo.length;
  const tooTall = certInfo.filter(c => c.h > LETTER_H).length, clipped = certInfo.filter(c => c.clipped).length, nobreak = certInfo.filter(c => !c.brk).length;
  ok(n >= 19 && tooTall === 0 && nobreak === 0, `print layout at Letter size: ${n} certificates, each fits one page (max ${Math.round(Math.max(...certInfo.map(c => c.h)))}px of ${LETTER_H}px), page break after each`);
  ok(clipped === 0, `print layout: no certificate content cut off (clipped=${clipped})`);
  if (name === 'chromium') {
    const pdf = await pp.pdf({ format: 'Letter', printBackground: true });
    fs.writeFileSync(path.join(OUT, 'chromium-certs-letter.pdf'), pdf);
    const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
    ok(pages === n, `Letter PDF: ${pages} pages for ${n} certificates`);
  } else {
    console.log(`INFO [${name}] page.pdf() is Chromium-only in Playwright; one-page-per-certificate checked by print-media layout above, not by a real PDF`);
  }
  await pc.close();

  ok(errors.length === 0, '0 page/console errors' + (errors.length ? ': ' + JSON.stringify(errors.slice(0, 5)) : ''));
  await browser.close();
  console.log(`[${name}] ${pass} passed, ${fail} failed`);
  return { pass, fail };
}

async function checkHead(URL) {
  let pass = 0, fail = 0;
  const ok = (c, m) => { if (c) pass++; else fail++; console.log(`${c ? 'PASS' : 'FAIL'} [head] ${m}`); };
  const html = await (await fetch(URL)).text();
  const meta = p => { const m = html.match(new RegExp(`<meta[^>]+property="${p}"[^>]+content="([^"]*)"`)); return m ? m[1] : null; };
  for (const k of ['og:title', 'og:description', 'og:image']) ok(!!meta(k), `${k} = ${meta(k)}`);
  const img = meta('og:image');
  if (img) {
    // test the image at the same path on the server being tested (live: the absolute URL itself)
    const u = new globalThis.URL(new globalThis.URL(img).pathname.split('/').pop(), URL).href;
    const r = await fetch(u); const b = Buffer.from(await r.arrayBuffer());
    ok(r.status === 200 && b.slice(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), `og:image ${u} -> HTTP ${r.status}, PNG=${b.slice(1, 4).toString() === 'PNG'}, ${b.length} bytes`);
    if (img.startsWith(URL) || !URL.includes('127.0.0.1')) ok(true, 'og:image absolute URL ' + img);
  }
  const ic = html.match(/<link[^>]+rel="icon"[^>]+href="([^"]+)"/);
  if (ic) { const r = await fetch(new globalThis.URL(ic[1], URL)); ok(r.status === 200, `favicon ${ic[1]} -> HTTP ${r.status}`); } else ok(false, 'favicon link tag present');
  console.log(`[head] ${pass} passed, ${fail} failed`);
  return { pass, fail };
}

(async () => {
  let URL = arg('url'), srv = null;
  if (arg('serve')) { srv = await serve(path.resolve(arg('serve'))); URL = srv.url; }
  console.log('Testing ' + URL + ' at ' + new Date().toISOString());
  const totals = [await checkHead(URL)];
  for (const e of ENGINES) totals.push(await runEngine(e, URL));
  if (srv) srv.s.close();
  const P = totals.reduce((a, t) => a + t.pass, 0), F = totals.reduce((a, t) => a + t.fail, 0);
  console.log(`\nTOTAL ${P} passed, ${F} failed`);
  process.exit(F ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
