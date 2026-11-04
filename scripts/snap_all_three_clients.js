const { chromium } = require('playwright');
const path = require('path');

const artifactDir = 'C:/Users/German Higuera/.gemini/antigravity/brain/8761bca4-9359-4dfb-8da2-b45fea38b9a1';

async function snapAll() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1100 } });
  const page = await context.newPage();

  try {
    console.log('Navigating to settings...');
    await page.goto('http://localhost:3001/admin/commercial?tab=operations&subtab=settings', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Switch to Canastas tab
    const canastasTab = page.locator('button:has-text("Modelos por Cliente (Canastas)")');
    await canastasTab.first().click();
    await page.waitForTimeout(2000);

    const clientsToTest = [
      { search: 'SAN JORGE', name: 'San Jorge', filename: 'verify_canastas_san_jorge_fixed.png' },
      { search: 'CORFERIAS', name: 'Corferias', filename: 'verify_canastas_corferias_fixed.png' },
      { search: 'MONTAÑA', name: 'La Montaña', filename: 'verify_canastas_montana_fixed.png' }
    ];

    for (const c of clientsToTest) {
      console.log(`Selecting ${c.name}...`);
      const pickerInput = page.locator('input[placeholder*="Buscar cliente matriz"]');
      await pickerInput.click();
      await pickerInput.fill(c.search);
      await page.waitForTimeout(1000);

      // Click the first matching option in dropdown
      const option = page.locator(`div:has-text("${c.search}")`).last();
      await option.click();
      await page.waitForTimeout(2000);

      await page.screenshot({ path: path.join(artifactDir, c.filename), fullPage: false });
      console.log(`Saved ${c.filename}`);
    }

  } catch (err) {
    console.error('Error snapping:', err);
  } finally {
    await browser.close();
  }
}

snapAll();
