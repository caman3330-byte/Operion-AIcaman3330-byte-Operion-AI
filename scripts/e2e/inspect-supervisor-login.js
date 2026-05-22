const { chromium } = require('playwright');
const URL = process.env.DASHBOARD_URL || 'http://localhost:3001';
(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on('console', (msg) => console.log('PAGE_CONSOLE', msg.type(), msg.text()));
  page.on('pageerror', (err) => console.log('PAGE_ERROR', err));
  page.on('requestfailed', (req) => console.log('REQUEST_FAILED', req.url(), req.failure()?.errorText));
  page.on('response', async (res) => {
    if (res.url().includes('/supervisor') || res.url().includes('/_next/data') || res.url().includes('/auth/v1')) {
      const text = await res.text().catch(() => null);
      const snippet = typeof text === 'string' ? text.slice(0, 500).replace(/\n/g, '\\n') : null;
      console.log('RESPONSE', res.status(), res.url(), snippet ? `BODY_SNIPPET=${snippet}` : 'NO_BODY');
    }
  });

  await page.goto(`${URL}/supervisor/login`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#email', { timeout: 30000 });
  await page.fill('#email', 'test-admin@operion.ai');
  await page.fill('#password', 'TestPass123!');

  await Promise.all([
    page.click('button[type="submit"]'),
    page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 })
  ]);

  console.log('URL after submit:', page.url());
  await page.waitForTimeout(5000);
  console.log('H1 texts:', await page.$$eval('h1', (nodes) => nodes.map((node) => node.textContent?.trim())));
  console.log('Form count:', await page.$$eval('form', (nodes) => nodes.length));
  console.log('BODY TEXT:', (await page.textContent('body'))?.slice(0, 1000));
  console.log('BODY HTML:', (await page.content()).slice(0, 2000));
  console.log('COOKIES:', await context.cookies());
  await browser.close();
})();
