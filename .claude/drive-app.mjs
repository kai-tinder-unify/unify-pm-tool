import { chromium } from 'file:///C:/Users/KaiTinder/AppData/Roaming/npm/node_modules/playwright/index.mjs';

const outDir = 'C:/Users/KaiTinder/projects/unify-pm-tool/.claude/screenshots';
const base = 'http://localhost:5173';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

// Login
await page.goto(`${base}/login`);
await page.waitForSelector('input[type=email]');
await page.screenshot({ path: `${outDir}/1-login.png` });
await page.fill('input[type=email]', 'ktinder@unifyconsulting.com');
await page.fill('input[type=password]', 'ascend123');
await page.click('button[type=submit]');
await page.waitForURL(`${base}/`);
await page.waitForTimeout(800);
await page.screenshot({ path: `${outDir}/2-dashboard.png` });

// Requests — board view
await page.click('a[href="/requests"]');
await page.waitForTimeout(600);
const boardBtn = page.getByRole('button', { name: 'board' });
if (await boardBtn.count()) await boardBtn.click();
await page.waitForTimeout(300);
await page.screenshot({ path: `${outDir}/3-requests-board.png` });

// Requests — list view
await page.getByRole('button', { name: 'list' }).click();
await page.waitForTimeout(300);
await page.screenshot({ path: `${outDir}/4-requests-list.png` });

// Request detail + modal
await page.locator('tbody a').first().click();
await page.waitForTimeout(600);
await page.screenshot({ path: `${outDir}/5-request-detail.png` });
await page.getByRole('button', { name: '+ Add task' }).click();
await page.waitForTimeout(300);
await page.screenshot({ path: `${outDir}/6-modal.png` });
await page.keyboard.press('Escape');
await page.getByRole('button', { name: 'Cancel' }).click().catch(() => {});
await page.waitForTimeout(200);

// Analytics
await page.click('a[href="/analytics"]');
await page.waitForTimeout(1200);
await page.screenshot({ path: `${outDir}/7-analytics.png` });

await browser.close();
console.log('done');
