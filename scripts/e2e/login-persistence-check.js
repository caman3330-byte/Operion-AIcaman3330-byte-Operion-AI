const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');
const URL = process.env.DASHBOARD_URL || 'http://localhost:3000';

(async () => {
  const userDataDir = path.join(os.tmpdir(), 'operion-dashboard-e2e-profile');
  if (!fs.existsSync(userDataDir)) {
    fs.mkdirSync(userDataDir, { recursive: true });
  }

  const browserContext = await chromium.launchPersistentContext(userDataDir, { headless: true });
  const page = await browserContext.newPage();
  page.on('pageerror', (err) => console.error('PAGE_ERROR', err));
  page.on('console', (msg) => console.log('PAGE_CONSOLE', msg.type(), msg.text()));

  try {
    await page.goto(`${URL}/supervisor/login`, { waitUntil: 'networkidle' });
    await page.waitForSelector('#email', { timeout: 20000 });
    await page.fill('#email', 'test-admin@operion.ai');
    await page.waitForSelector('#password', { timeout: 20000 });
    await page.fill('#password', 'TestPass123!');
    await Promise.all([
      page.click('button[type="submit"]'),
      page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 })
    ]);

    if (!page.url().includes('/supervisor')) {
      throw new Error(`Login did not redirect to /supervisor, got ${page.url()}`);
    }

    const cookies = await browserContext.cookies();
    console.log('Login cookies count', cookies.length);
    await browserContext.close();

    const reopenContext = await chromium.launchPersistentContext(userDataDir, { headless: true });
    const reopenPage = await reopenContext.newPage();
    reopenPage.on('pageerror', (err) => console.error('PAGE_ERROR', err));
    await reopenPage.goto(`${URL}/supervisor`, { waitUntil: 'domcontentloaded' });
    await reopenPage.waitForSelector('text=Internal operator platform', { timeout: 30000 });

    const loggedInText = await reopenPage.textContent('body');
    if (!loggedInText?.includes('Internal operator platform')) {
      throw new Error('Reopened context did not preserve authenticated supervisor page');
    }

    console.log('Session persistence check passed');
    await reopenContext.close();
    process.exit(0);
  } catch (error) {
    console.error('Session persistence check failed:', error);
    await browserContext.close();
    process.exit(1);
  }
})();
