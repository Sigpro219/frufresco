const { chromium } = require('playwright');

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('http://localhost:3001/admin/commercial?tab=operations&subtab=settings', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  const buttons = await page.$$eval('button', els => els.map(e => e.innerText.trim()).filter(Boolean));
  console.log('Buttons:', buttons);
  await browser.close();
}
run();
