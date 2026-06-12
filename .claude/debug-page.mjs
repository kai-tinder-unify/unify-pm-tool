import { chromium } from 'file:///C:/Users/KaiTinder/AppData/Roaming/npm/node_modules/playwright/index.mjs';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('console', (m) => console.log('[console]', m.type(), m.text().slice(0, 500)));
page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 1000)));
page.on('requestfailed', (r) => console.log('[requestfailed]', r.url(), r.failure()?.errorText));

const resp = await page.goto('http://localhost:5173/login', { waitUntil: 'domcontentloaded' });
console.log('status:', resp?.status());
await page.waitForTimeout(4000);
console.log('body text:', (await page.textContent('body'))?.slice(0, 300));
await page.screenshot({ path: 'C:/Users/KaiTinder/projects/unify-pm-tool/.claude/screenshots/debug.png' });
await browser.close();
