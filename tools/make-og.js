// Builds og-image.png (1200x630) and favicon.png (64x64) from the Kit itself.
// Usage: node tools/make-og.js   (run from the repo root)
const { chromium } = require('playwright');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const KIT = require('url').pathToFileURL(path.join(ROOT, 'index.html')).href;

(async () => {
  const b = await chromium.launch();
  // real certificate from the sample data, rendered by the Kit
  const k = await b.newPage({ viewport: { width: 900, height: 1400 }, deviceScaleFactor: 2, locale: 'en-US' });
  await k.goto(KIT);
  await k.getByRole('button', { name: 'Load sample data' }).first().click();
  await k.getByRole('button', { name: 'Certificates' }).click();
  const cert = (await k.locator('.cert').first().screenshot()).toString('base64');

  const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
  await p.setContent(`<!doctype html><meta charset="utf-8"><style>
  *{box-sizing:border-box}body{margin:0;width:1200px;height:630px;background:#f3f1ec;color:#1d1b18;font-family:Georgia,'Times New Roman',serif;position:relative;overflow:hidden}
  .t{position:absolute;left:64px;top:70px;width:600px}
  .b{font:600 18px Arial,sans-serif;letter-spacing:.32em;color:#a98a4a;margin:0 0 18px}
  h1{font-weight:500;font-size:64px;line-height:1.05;margin:0 0 24px}
  p.s{font:400 27px/1.4 Arial,sans-serif;color:#4a463f;margin:0}
  .f{position:absolute;left:64px;bottom:58px;font:600 22px Arial,sans-serif;color:#26443a}
  img{position:absolute;left:720px;top:46px;width:420px;border-radius:6px;box-shadow:0 18px 48px rgba(0,0,0,.2);transform:rotate(2deg);background:#fff}
  .bar{position:absolute;left:0;right:0;bottom:0;height:12px;background:#26443a}
  </style><div class="t"><p class="b">ENTELEORA</p><h1>Exhibition &amp; Edition Kit</h1>
  <p class="s">Wall labels, price lists, certificates of authenticity and an edition register for artists.</p></div>
  <div class="f">Runs in your browser · no account</div>
  <img src="data:image/png;base64,${cert}"><div class="bar"></div>`);
  await p.screenshot({ path: path.join(ROOT, 'og-image.png') });

  const f = await b.newPage({ viewport: { width: 64, height: 64 } });
  await f.setContent(`<body style="margin:0;width:64px;height:64px;background:#26443a;border-radius:12px;display:flex;align-items:center;justify-content:center;font:500 44px Georgia,serif;color:#f3f1ec">E</body>`);
  await f.screenshot({ path: path.join(ROOT, 'favicon.png'), omitBackground: true });
  await b.close();
  console.log('wrote og-image.png and favicon.png');
})();
