const { chromium } = require('playwright');
const URL = process.env.DASHBOARD_URL || 'http://localhost:3000';
(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on('console', (msg) => console.log('PAGE_CONSOLE', msg.type(), msg.text()));
  page.on('pageerror', (err) => console.log('PAGE_ERROR', err));

  page.on('requestfinished', (req) => {
    if (req.url().includes('/auth/v1')) {
      console.log('API request finished:', req.method(), req.url());
    }
  });
  try {
    console.log('Opening supervisor login');
    await page.goto(`${URL}/supervisor/login`, { waitUntil: 'networkidle' });
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('form', { timeout: 30000 });
    // Fill form fields - wait for inputs to be present and use ids
    await page.waitForSelector('#email', { timeout: 30000 });
    await page.fill('#email', 'test-admin@operion.ai');
    await page.waitForSelector('#password', { timeout: 30000 });
    await page.fill('#password', 'TestPass123!');
    await Promise.all([
      page.click('button[type="submit"]'),
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 })
    ]);
    await page.waitForURL('**/supervisor', { timeout: 30000 });
    const authenticatedSelector = 'text=Internal operator platform';
    await page.waitForSelector(authenticatedSelector, { timeout: 30000 });

    const submitUrl = page.url();
    console.log('After submit, url=', submitUrl);
    if (submitUrl.includes('email=') || submitUrl.includes('password=')) {
      throw new Error('Login form performed a default GET submission instead of client-side auth');
    }

    const supervisorText = await page.textContent('body');
    if (!supervisorText?.includes('Internal operator platform')) {
      throw new Error('Did not land on authenticated supervisor page after login');
    }

    const cookies = await context.cookies();
    console.log('Cookies after login:', cookies.map((cookie) => ({ name: cookie.name, domain: cookie.domain, httpOnly: cookie.httpOnly })));

    // Check admin landing
    const adminPaths = ['/admin', '/admin/leads', '/admin/ai', '/admin/lenders', '/admin/testing'];
    for (const p of adminPaths) {
      const full = `${URL}${p}`;
      await page.goto(full, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('text=Internal operator platform', { timeout: 30000 });
      const fullText = await page.textContent('body');
      if (!fullText?.includes('Internal operator platform')) {
        throw new Error(`Protected path ${p} did not render authenticated admin content`);
      }
      console.log('Checked', p, 'authenticated content is present');
    }
    console.log('E2E login-and-admin-check: SUCCESS');
    await context.close();
    process.exit(0);
  } catch (err) {
    console.error('E2E test failed:', err);
    await context.close();
    process.exit(2);
  }
})();
