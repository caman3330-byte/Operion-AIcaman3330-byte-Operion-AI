const { chromium } = require('playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const out = __dirname;
const url = 'http://localhost:3012';
const key = 'operion-scroll-cinematic-seen-v1';
const results = { errors: [], checks: {} };
async function snapshot(page) {
  return page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > innerWidth,
    journey: !!document.querySelector('[aria-label="Operion Capital application journey"]'),
    seen: sessionStorage.getItem('operion-scroll-cinematic-seen-v1'),
    y: scrollY,
    height: document.documentElement.scrollHeight
  }));
}
async function scroll(page, ratio) {
  await page.evaluate(r => window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * r), ratio);
  await page.waitForTimeout(550);
}
(async () => {
  const browser = await chromium.launch();
  try {
    for (const mobile of [false, true]) {
      const name = mobile ? 'mobile' : 'desktop';
      const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 }, isMobile: mobile, hasTouch: mobile, recordVideo: { dir: out, size: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 } } });
      const page = await context.newPage();
      page.on('pageerror', e => results.errors.push(name + ': ' + e.message));
      page.on('console', m => { if (m.type() === 'error') results.errors.push(name + ': ' + m.text()); });
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.locator('img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
      results.checks[name + 'Fresh'] = await snapshot(page);
      await page.screenshot({ path: path.join(out, mobile ? 'final-boss-mobile-first-frame.png' : 'final-boss-first-frame.png') });
      if (mobile) {
        const cdp = await context.newCDPSession(page);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 195, y: 650 }] });
        for (let y = 600; y >= 200; y -= 40) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 195, y }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await page.waitForTimeout(400);
        results.checks.touchScroll = (await snapshot(page)).y > 0;
      } else {
        await page.keyboard.press('PageDown');
        await page.waitForTimeout(500);
        results.checks.keyboardScroll = (await snapshot(page)).y > 0;
      }
      for (let r = 0; r <= 0.72; r += 0.03) {
        await scroll(page, r);
        if ((await snapshot(page)).overflow) results.errors.push(name + ' overflow at ' + r);
        if (Math.abs(r - 0.66) < 0.01) await page.screenshot({ path: path.join(out, mobile ? 'final-boss-mobile-mid.png' : 'final-boss-homepage-transition.png') });
      }
      await page.mouse.wheel(0, 5000);
      await scroll(page, 1);
      results.checks[name + 'Complete'] = await snapshot(page);
      results.checks[name + 'Footer'] = await page.locator('footer').evaluate(el => el.getBoundingClientRect().top < innerHeight);
      await page.reload({ waitUntil: 'networkidle' });
      await page.locator('[aria-label="Operion Capital application journey"]').waitFor({ state: 'detached' });
      results.checks[name + 'Returning'] = await snapshot(page);
      await page.evaluate(k => sessionStorage.removeItem(k), key);
      await page.reload({ waitUntil: 'networkidle' });
      await page.getByRole('button', { name: 'Skip intro' }).click();
      results.checks[name + 'Skip'] = await snapshot(page);
      const video = page.video();
      await context.close();
      await video.saveAs(path.join(out, 'final-boss-' + name + '-complete.webm'));
    }
    const reduced = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await reduced.newPage();
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.locator('[aria-label="Operion Capital application journey"]').waitFor({ state: 'detached' });
    results.checks.reducedMotion = await snapshot(page);
    await reduced.close();
    const nojs = await browser.newContext({ javaScriptEnabled: false });
    const first = await nojs.newPage();
    await first.goto(url, { waitUntil: 'load' });
    results.checks.serverFirstFrame = await first.locator('[aria-label="Operion Capital application journey"]').count() === 1;
    await nojs.close();
    await fs.writeFile(path.join(out, 'final-boss-results.json'), JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
