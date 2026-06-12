import { chromium } from 'file:///C:/Users/KaiTinder/AppData/Roaming/npm/node_modules/playwright/index.mjs';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://localhost:5173/login');
await page.fill('input[type=email]', 'ktinder@unifyconsulting.com');
await page.fill('input[type=password]', 'ascend123');
await page.click('button[type=submit]');
await page.waitForURL('http://localhost:5173/');
await page.goto('http://localhost:5173/analytics');
await page.waitForTimeout(1500);
const body = await page.textContent('body');
for (const phrase of ['Hours by person', 'Team contribution', 'All team members', 'Multi-contributor']) {
  console.log(phrase, '->', body.includes(phrase) ? 'STILL PRESENT' : 'gone');
}
await page.screenshot({ path: 'C:/Users/KaiTinder/projects/unify-pm-tool/.claude/screenshots/8-analytics-after.png', fullPage: true });
await browser.close();
