const { chromium } = require('playwright');
const URL = process.env.DASHBOARD_URL || 'http://localhost:3000';
(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on('console', (msg) => console.log('PAGE_CONSOLE', msg.type(), msg.text()));
  page.on('pageerror', (err) => console.log('PAGE_ERROR', err));
  page.on('requestfailed', (req) => console.log('REQUEST_FAILED', req.url(), req.failure()?.errorText));
  await page.goto(`${URL}/supervisor/login`, { waitUntil: 'networkidle' });
  console.log('PAGE URL', page.url());
  console.log('FORM HTML', await page.$eval('form', (form) => form.outerHTML));
  await page.fill('#email', 'test-admin@operion.ai');
  await page.fill('input[type="password"]', 'TestPass123!');
  await Promise.all([
    page.click('button[type="submit"]'),
    page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch((err) => console.log('NAV ERROR', err.message))
  ]);
  console.log('After submit URL', page.url());
  const html = await page.content();
  console.log('Page content snippet:', html.slice(0,1000));
  await browser.close();
})();
