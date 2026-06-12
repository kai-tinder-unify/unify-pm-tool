import { chromium } from 'file:///C:/Users/KaiTinder/AppData/Roaming/npm/node_modules/playwright/index.mjs';

const outDir = 'C:/Users/KaiTinder/projects/unify-pm-tool/.claude/screenshots';
const base = 'http://localhost:5173';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 300)));

await page.goto(`${base}/login`);
await page.fill('input[type=email]', 'ktinder@unifyconsulting.com');
await page.fill('input[type=password]', 'ascend123');
await page.click('button[type=submit]');
await page.waitForURL(`${base}/`);
await page.waitForTimeout(800);
await page.screenshot({ path: `${outDir}/t1-dashboard.png` });

// Task board
await page.click('a[href="/tasks"]');
await page.waitForTimeout(600);
await page.screenshot({ path: `${outDir}/t2-board.png` });

// List view
await page.getByRole('button', { name: 'list' }).click();
await page.waitForTimeout(300);
await page.screenshot({ path: `${outDir}/t3-list.png` });

// Task detail
await page.locator('tbody a').first().click();
await page.waitForTimeout(600);
await page.screenshot({ path: `${outDir}/t4-detail.png` });

// New task form
await page.click('a[href="/intake"]');
await page.waitForTimeout(500);
await page.screenshot({ path: `${outDir}/t5-newtask.png` });

// Create one end-to-end
await page.fill('input.input', 'Playwright smoke task');
await page.fill('input[placeholder="e.g. Sandra Liu"]', 'Test Leader');
await page.selectOption('select.input >> nth=0', { index: 1 }); // bucket
await page.getByRole('button', { name: 'Create task' }).click();
await page.waitForURL(/\/tasks\//, { timeout: 10000 });
await page.waitForTimeout(600);
await page.screenshot({ path: `${outDir}/t6-created.png` });
console.log('created task at', page.url());

// Log hours on it
await page.getByRole('button', { name: 'Log my hours' }).click();
await page.waitForTimeout(300);
await page.fill('input[placeholder="e.g. 6.5"]', '2.5');
await page.getByRole('button', { name: 'Save', exact: true }).click();
await page.waitForTimeout(800);
await page.screenshot({ path: `${outDir}/t7-hours-logged.png` });

// Clean up the smoke task
const taskId = page.url().split('/tasks/')[1];
const del = await page.evaluate(async (id) => {
  const r = await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
  return r.status;
}, taskId);
console.log('cleanup delete status:', del);

// Analytics
await page.click('a[href="/analytics"]');
await page.waitForTimeout(1200);
await page.screenshot({ path: `${outDir}/t8-analytics.png` });

await browser.close();
console.log('done');
